import {
  initialState,
  generateLegalMoves,
  generatePatternMoves,
  makeMove,
  isInCheck,
  evaluateGameEnd,
  idxToSquare,
  pieceColor,
} from "./rules.js";

export const state = {
  game: initialState(),
  selected: null,
  legalMoves: [],
  lastMove: null,
  moveHistory: [],
  orientation: "w",
  gameOver: false,
  dragFrom: null,
  dragging: null,
  hoverTarget: null,
  inCheck: { w: false, b: false },
  cooldowns: Array(64).fill(null),
  premove: Array(64).fill(null),
  patternMoves: [],
  session: {
    mode: "gametesting",
    role: "solo",
    gameId: null,
    opponentJoined: false,
    gameStarted: false,
  },
};

export function resetGame() {
  // If PvP and not started yet, leave cooldowns in a pending state (full circle, no countdown)
  const pendingCooldowns =
    state.session.mode === "pvp" && !state.session.gameStarted
      ? state.game.board.map((p) => (p ? { pending: true, duration: 3000 } : null))
      : null;

  state.game = initialState();
  state.selected = null;
  state.legalMoves = [];
  state.lastMove = null;
  state.moveHistory = [];
  state.gameOver = false;
  state.dragFrom = null;
  state.dragging = null;
  state.hoverTarget = null;
  state.inCheck = { w: false, b: false };
  const now = Date.now();
  state.cooldowns =
    pendingCooldowns ||
    state.game.board.map((p) => (p ? { until: now + 3000, duration: 3000 } : null));
  state.premove = Array(64).fill(null);
  state.patternMoves = [];
  state.gameOver = false;
}

export function selectSquare(idx) {
  state.selected = idx;
  const color = pieceColor(state.game.board[idx]);
  state.legalMoves = generateLegalMoves(state.game, color).filter((m) => m.from === idx);
  state.patternMoves = generatePatternMoves(state.game, idx);
  if (state.premove[idx]) state.premove[idx] = null;
  state.hoverTarget = null;
}

export function clearSelection() {
  state.selected = null;
  state.legalMoves = [];
  state.patternMoves = [];
  state.hoverTarget = null;
}

export function setOrientation(orientation) {
  state.orientation = orientation;
}

export function setMode(mode) {
  state.session.mode = mode;
}

export function setRole(role) {
  state.session.role = role;
}

export function setGameId(id) {
  state.session.gameId = id;
}

export function setOpponentJoined(val) {
  state.session.opponentJoined = val;
}

export function setGameStarted(val) {
  state.session.gameStarted = val;
}

export function startInitialCooldowns() {
  const now = Date.now();
  state.cooldowns = state.game.board.map((p) =>
    p ? { until: now + 3000, duration: 3000 } : null
  );
}

export function moveToString(move) {
  const piece = move.piece.toLowerCase();
  const promo = move.promotion ? `=${move.promotion.toUpperCase()}` : "";
  const capture = move.captured ? "x" : "-";
  const notation = `${piece === "p" ? "" : move.piece.toUpperCase()}${idxToSquare(move.from)}${capture}${idxToSquare(move.to)}${promo}`;
  return notation;
}

export function applyMove(move) {
  state.game = makeMove(state.game, move);
  state.lastMove = { from: move.from, to: move.to };
  state.moveHistory.push(moveToString(move));
  state.selected = null;
  state.legalMoves = [];
  state.patternMoves = [];
  state.hoverTarget = null;
  const now = Date.now();
  // set cooldown for destination piece
  state.cooldowns[move.to] = { until: now + 10000, duration: 10000 };
  state.cooldowns[move.from] = null;
  state.premove[move.from] = null;
  state.premove[move.to] = null;
  state.inCheck = {
    w: isInCheck(state.game, "w"),
    b: isInCheck(state.game, "b"),
  };
  const outcome = evaluateGameEnd(state.game);
  if (outcome) state.gameOver = true;
  return outcome;
}

export function legalMoves() {
  return generateLegalMoves(state.game);
}

export function canSelect(idx) {
  const piece = state.game.board[idx];
  if (!piece || state.gameOver) return false;
  if (state.session.mode === "pvp" && !state.session.gameStarted) return false;
  return true;
}

export function isOnCooldown(idx) {
  const cd = state.cooldowns[idx];
  return !!cd && cd.until > Date.now();
}

export function setPremove(move) {
  state.premove[move.from] = {
    from: move.from,
    to: move.to,
    piece: move.piece,
    promotion: move.promotion || null,
    createdAt: Date.now(),
  };
}

export function clearPremove(idx) {
  state.premove[idx] = null;
}

export function processPremoves(onMove) {
  if (state.gameOver) return { moved: false, outcome: null };
  const now = Date.now();
  let moved = false;
  let outcome = null;
  const queue = state.premove.filter(Boolean).sort((a, b) => a.createdAt - b.createdAt);
  for (const pm of queue) {
    const piece = state.game.board[pm.from];
    if (!piece || pieceColor(piece) !== pieceColor(pm.piece)) {
      state.premove[pm.from] = null;
      continue;
    }
    const cd = state.cooldowns[pm.from];
    if (cd && cd.until > now) continue;
    const color = pieceColor(piece);
    const moves = generateLegalMoves(state.game, color);
    let move =
      moves.find((m) => m.from === pm.from && m.to === pm.to && (!pm.promotion || m.promotion === pm.promotion)) ||
      moves.find((m) => m.from === pm.from && m.to === pm.to);
    if (move) {
      outcome = applyMove(move);
      moved = true;
      if (onMove) onMove(move);
      if (outcome) break;
    }
  }
  return { moved, outcome };
}
