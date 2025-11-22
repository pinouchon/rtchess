import {
  initialState,
  generateLegalMoves,
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
};

export function resetGame() {
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
  state.cooldowns = state.game.board.map((p) =>
    p ? { until: now + 3000, duration: 3000 } : null
  );
}

export function selectSquare(idx) {
  state.selected = idx;
  const color = pieceColor(state.game.board[idx]);
  state.legalMoves = generateLegalMoves(state.game, color).filter((m) => m.from === idx);
  state.hoverTarget = null;
}

export function clearSelection() {
  state.selected = null;
  state.legalMoves = [];
  state.hoverTarget = null;
}

export function setOrientation(orientation) {
  state.orientation = orientation;
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
  state.hoverTarget = null;
  const now = Date.now();
  // set cooldown for destination piece
  state.cooldowns[move.to] = { until: now + 10000, duration: 10000 };
  state.cooldowns[move.from] = null;
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
  if (!piece) return false;
  const cd = state.cooldowns[idx];
  if (cd && cd.until > Date.now()) return false;
  return true;
}
