import {
  initialState,
  generateLegalMoves,
  generatePatternMoves,
  makeMove,
  isInCheck,
  evaluateGameEnd,
  idxToSquare,
  pieceColor,
  cloneState as cloneGameState,
} from "./rules.js";

function createCoreState() {
  const game = initialState();
  const now = Date.now();
  return {
    game,
    lastMove: null,
    moveHistory: [],
    inCheck: { w: false, b: false },
    gameOver: false,
    outcome: null,
    cooldowns: game.board.map((p) => (p ? { until: now + 3000, duration: 3000 } : null)),
    premove: Array(64).fill(null),
  };
}

function cloneCooldown(cd) {
  return cd ? { ...cd } : null;
}

function clonePremove(pm) {
  return pm ? { ...pm } : null;
}

function cloneCoreState(core) {
  return {
    game: cloneGameState(core.game),
    lastMove: core.lastMove ? { ...core.lastMove } : null,
    moveHistory: [...core.moveHistory],
    inCheck: { ...core.inCheck },
    gameOver: core.gameOver,
    outcome: core.outcome ? { ...core.outcome } : null,
    cooldowns: core.cooldowns.map(cloneCooldown),
    premove: core.premove.map(clonePremove),
  };
}

function copyCoreState(source, target) {
  target.game = cloneGameState(source.game);
  target.lastMove = source.lastMove ? { ...source.lastMove } : null;
  target.moveHistory = [...source.moveHistory];
  target.inCheck = { ...source.inCheck };
  target.gameOver = source.gameOver;
  target.outcome = source.outcome ? { ...source.outcome } : null;
  target.cooldowns = source.cooldowns.map(cloneCooldown);
  target.premove = source.premove.map(clonePremove);
}

export const serverState = createCoreState();

const initialCore = cloneCoreState(serverState);

export const state = {
  game: initialCore.game,
  selected: null,
  legalMoves: [],
  lastMove: initialCore.lastMove,
  moveHistory: initialCore.moveHistory,
  orientation: "w",
  gameOver: initialCore.gameOver,
  outcome: initialCore.outcome,
  dragFrom: null,
  dragging: null,
  hoverTarget: null,
  inCheck: initialCore.inCheck,
  cooldowns: initialCore.cooldowns,
  premove: initialCore.premove,
  patternMoves: [],
  session: {
    mode: "gametesting",
    role: "solo",
    gameId: null,
    opponentJoined: false,
    gameStarted: false,
    gameState: "gametesting",
  },
};

export function resetGame() {
  // If PvP and not started yet, leave cooldowns in a pending state (full circle, no countdown)
  const pendingCooldowns =
    state.session.mode === "pvp" && !state.session.gameStarted
      ? initialState().board.map((p) => (p ? { pending: true, duration: 3000 } : null))
      : null;

  const freshCore = createCoreState();
  const now = Date.now();
  if (pendingCooldowns) {
    freshCore.cooldowns = pendingCooldowns;
  } else {
    freshCore.cooldowns = freshCore.game.board.map((p) =>
      p ? { until: now + 3000, duration: 3000 } : null
    );
  }
  copyCoreState(freshCore, serverState);
  copyCoreState(serverState, state);
  state.selected = null;
  state.legalMoves = [];
  state.patternMoves = [];
  state.dragFrom = null;
  state.dragging = null;
  state.hoverTarget = null;
  state.gameOver = false;
  state.outcome = null;
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
  // Legacy helper: keep boolean in sync but prefer setGameState
  state.session.gameStarted = val;
  if (state.session.mode === "pvp") {
    if (val) {
      state.session.gameState = "started";
    } else if (state.session.gameState === "started") {
      state.session.gameState = "ready_to_start";
    }
  }
}

export function setGameState(lifecycle) {
  state.session.gameState = lifecycle;
  state.session.gameStarted = lifecycle === "started";
}

export function startInitialCooldowns() {
  const now = Date.now();
  const mapper = (board) => board.map((p) => (p ? { until: now + 3000, duration: 3000 } : null));
  state.cooldowns = mapper(state.game.board);
  serverState.cooldowns = mapper(serverState.game.board);
}

export function moveToString(move) {
  const piece = move.piece.toLowerCase();
  const promo = move.promotion ? `=${move.promotion.toUpperCase()}` : "";
  const capture = move.captured ? "x" : "-";
  const notation = `${piece === "p" ? "" : move.piece.toUpperCase()}${idxToSquare(move.from)}${capture}${idxToSquare(move.to)}${promo}`;
  return notation;
}

export function applyMove(move, store = state, now = Date.now()) {
  store.game = makeMove(store.game, move);
  store.lastMove = { from: move.from, to: move.to };
  store.moveHistory.push(moveToString(move));
  store.selected = null;
  store.legalMoves = [];
  store.patternMoves = [];
  store.hoverTarget = null;
  // set cooldown for destination piece
  store.cooldowns[move.to] = { until: now + 10000, duration: 10000 };
  store.cooldowns[move.from] = null;
  store.premove[move.from] = null;
  store.premove[move.to] = null;
  store.inCheck = {
    w: isInCheck(store.game, "w"),
    b: isInCheck(store.game, "b"),
  };
  const outcome = evaluateGameEnd(store.game);
  if (outcome) {
    store.gameOver = true;
    store.outcome = outcome;
  } else {
    store.outcome = null;
  }
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

export function isOnCooldown(idx, store = state, now = Date.now()) {
  const cd = store.cooldowns[idx];
  if (!cd) return false;
  if (cd.pending) return true;
  return cd.until > now;
}

export function setPremove(move, store = state) {
  store.premove[move.from] = {
    from: move.from,
    to: move.to,
    piece: move.piece,
    promotion: move.promotion || null,
    createdAt: move.createdAt || Date.now(),
  };
}

export function clearPremove(idx, store = state) {
  store.premove[idx] = null;
}

export function processPremoves(store = state, now = Date.now(), onMove) {
  if (store.gameOver) return { moved: false, outcome: null };
  let moved = false;
  let outcome = null;
  const queue = store.premove.filter(Boolean).sort((a, b) => a.createdAt - b.createdAt);
  for (const pm of queue) {
    const piece = store.game.board[pm.from];
    if (!piece || pieceColor(piece) !== pieceColor(pm.piece)) {
      store.premove[pm.from] = null;
      continue;
    }
    const cd = store.cooldowns[pm.from];
    if (cd && cd.until > now) continue;
    const color = pieceColor(piece);
    const moves = generateLegalMoves(store.game, color);
    let move =
      moves.find((m) => m.from === pm.from && m.to === pm.to && (!pm.promotion || m.promotion === pm.promotion)) ||
      moves.find((m) => m.from === pm.from && m.to === pm.to);
    if (move) {
      outcome = applyMove(move, store, now);
      moved = true;
      if (onMove) onMove(move, pm);
      if (outcome) break;
    }
  }
  return { moved, outcome };
}

export function applyIntent(intent, store = state, now = Date.now()) {
  if (store.gameOver) return { accepted: false, reason: "game over" };
  const { from, to, promotion } = intent;
  const piece = store.game.board[from];
  if (!piece) return { accepted: false, reason: "no piece" };
  const patterns = generatePatternMoves(store.game, from);
  const targetPattern = patterns.find((p) => p.to === to);
  if (!targetPattern) return { accepted: false, reason: "invalid target" };

  const color = pieceColor(piece);
  const legalMoves = generateLegalMoves(store.game, color).filter((m) => m.from === from);
  const legalMove =
    legalMoves.find((m) => m.to === to && (!promotion || m.promotion === promotion)) ||
    legalMoves.find((m) => m.to === to);

  const onCd = isOnCooldown(from, store, now);
  if (!onCd && legalMove) {
    const outcome = applyMove(legalMove, store, now);
    return { accepted: true, executed: true, premoved: false, outcome };
  }

  setPremove(
    {
      from,
      to,
      piece,
      promotion: promotion || (legalMove && legalMove.promotion) || null,
      createdAt: intent.createdAt || now,
    },
    store
  );
  return { accepted: true, executed: false, premoved: true };
}

export function snapshotCore(store = state) {
  return cloneCoreState(store);
}

export function hydrateClientFromCore(core) {
  copyCoreState(core, state);
  state.selected = null;
  state.legalMoves = [];
  state.patternMoves = [];
  state.hoverTarget = null;
  state.dragFrom = null;
  state.dragging = null;
}

export function forceOutcome(outcome, store = state) {
  store.gameOver = true;
  store.outcome = outcome ? { ...outcome } : null;
  store.selected = null;
  store.legalMoves = [];
  store.patternMoves = [];
  store.hoverTarget = null;
  store.dragFrom = null;
  store.dragging = null;
  store.premove = store.premove.map(() => null);
}
