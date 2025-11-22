import { generateLegalMoves, makeMove, evaluateGameEnd, pieceColor } from "./rules.js";

const MATERIAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

export function evaluateBoard(game) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const piece = game.board[i];
    if (!piece) continue;
    const val = MATERIAL[piece.toLowerCase()];
    score += pieceColor(piece) === "w" ? val : -val;
  }
  return score;
}

export function evaluatePosition(game, outcome, depth) {
  if (outcome?.title === "Checkmate") {
    const winner = game.turn === "w" ? "b" : "w";
    const mateValue = 100000 - depth * 100;
    return winner === "w" ? mateValue : -mateValue;
  }
  if (outcome?.title === "Stalemate" || outcome?.title === "Draw") return 0;
  return evaluateBoard(game);
}

export function findBestMove(game, depth, aiColor) {
  let bestMove = null;
  let bestScore = aiColor === "w" ? -Infinity : Infinity;
  const moves = generateLegalMoves(game);
  for (const move of moves) {
    const next = makeMove(game, move);
    const score = minimax(next, depth - 1, -Infinity, Infinity, aiColor);
    if (aiColor === "w" && score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (aiColor === "b" && score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}

function minimax(game, depth, alpha, beta, aiColor) {
  const outcome = evaluateGameEnd(game);
  if (depth === 0 || outcome) {
    return evaluatePosition(game, outcome, depth);
  }
  const moves = generateLegalMoves(game);
  if (!moves.length) return evaluatePosition(game, outcome, depth);

  if (game.turn === aiColor) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const next = makeMove(game, move);
      const evalScore = minimax(next, depth - 1, alpha, beta, aiColor);
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const next = makeMove(game, move);
      const evalScore = minimax(next, depth - 1, alpha, beta, aiColor);
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}
