import {
  initialState,
  generateLegalMoves,
  makeMove,
  isInCheck,
  evaluateGameEnd,
  idxToSquare,
  pieceColor,
} from "./rules.js";
import { findBestMove } from "./ai.js";

export const state = {
  game: initialState(),
  selected: null,
  legalMoves: [],
  lastMove: null,
  moveHistory: [],
  orientation: "w",
  playerSide: "w",
  aiSide: "b",
  difficulty: 2,
  gameOver: false,
  dragFrom: null,
  dragging: null,
  hoverTarget: null,
  inCheck: { w: false, b: false },
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
}

export function selectSquare(idx) {
  state.selected = idx;
  state.legalMoves = generateLegalMoves(state.game).filter((m) => m.from === idx);
  state.hoverTarget = null;
}

export function clearSelection() {
  state.selected = null;
  state.legalMoves = [];
  state.hoverTarget = null;
}

export function setPlayerSide(side) {
  state.playerSide = side;
  state.aiSide = side === "w" ? "b" : "w";
}

export function setDifficulty(level) {
  state.difficulty = level;
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
  state.inCheck = {
    w: isInCheck(state.game, "w"),
    b: isInCheck(state.game, "b"),
  };
  const outcome = evaluateGameEnd(state.game);
  if (outcome) state.gameOver = true;
  return outcome;
}

export function aiMove() {
  if (state.gameOver || state.game.turn !== state.aiSide) return null;
  const legal = generateLegalMoves(state.game);
  if (!legal.length) return null;
  const depth = state.difficulty + 1;
  const best = findBestMove(state.game, depth, state.aiSide);
  const move = best || legal[Math.floor(Math.random() * legal.length)];
  return move;
}

export function legalMoves() {
  return generateLegalMoves(state.game);
}

export function canSelect(idx) {
  const piece = state.game.board[idx];
  return piece && pieceColor(piece) === state.game.turn && pieceColor(piece) === state.playerSide;
}
