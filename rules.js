export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"]; // 0 = a8, 63 = h1

export function pieceColor(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? "w" : "b";
}

export function idxToSquare(idx) {
  const file = FILES[idx % 8];
  const rank = 8 - Math.floor(idx / 8);
  return `${file}${rank}`;
}

export function squareToIdx(square) {
  const file = square[0];
  const rank = parseInt(square[1], 10);
  const fileIdx = FILES.indexOf(file);
  return (8 - rank) * 8 + fileIdx;
}

export function isLightSquare(idx) {
  const rank = Math.floor(idx / 8);
  const file = idx % 8;
  return (rank + file) % 2 === 0;
}

function stepSquare(from, dir) {
  const to = from + dir;
  if (to < 0 || to >= 64) return null;
  const fromFile = from % 8;
  const toFile = to % 8;
  if (dir === 1 && toFile !== fromFile + 1) return null;
  if (dir === -1 && toFile !== fromFile - 1) return null;
  if ((dir === 8 || dir === -8) && toFile !== fromFile) return null;
  if (dir === 7 && toFile !== fromFile - 1) return null;
  if (dir === -7 && toFile !== fromFile + 1) return null;
  if (dir === 9 && toFile !== fromFile + 1) return null;
  if (dir === -9 && toFile !== fromFile - 1) return null;
  return to;
}

const initialBoardArray = () => [
  "r",
  "n",
  "b",
  "q",
  "k",
  "b",
  "n",
  "r",
  "p",
  "p",
  "p",
  "p",
  "p",
  "p",
  "p",
  "p",
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  "P",
  "P",
  "P",
  "P",
  "P",
  "P",
  "P",
  "P",
  "R",
  "N",
  "B",
  "Q",
  "K",
  "B",
  "N",
  "R",
];

export function initialState() {
  return {
    board: initialBoardArray(),
    turn: "w",
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
  };
}

export function cloneState(game) {
  return {
    board: game.board.slice(),
    turn: game.turn,
    castling: { ...game.castling },
    enPassant: game.enPassant,
    halfmove: game.halfmove,
    fullmove: game.fullmove,
  };
}

export function generateLegalMoves(game, activeColor = game.turn) {
  const moves = [];
  for (let i = 0; i < 64; i++) {
    const piece = game.board[i];
    if (!piece || pieceColor(piece) !== activeColor) continue;
    moves.push(...generateMovesFromSquare(game, i, piece));
  }
  return moves;
}

function generateMovesFromSquare(game, idx, piece) {
  const type = piece.toLowerCase();
  switch (type) {
    case "p":
      return generatePawnMoves(game, idx, piece);
    case "n":
      return generateKnightMoves(game, idx, piece);
    case "b":
      return generateSlidingMoves(game, idx, piece, [7, 9, -7, -9]);
    case "r":
      return generateSlidingMoves(game, idx, piece, [1, -1, 8, -8]);
    case "q":
      return generateSlidingMoves(game, idx, piece, [1, -1, 8, -8, 7, 9, -7, -9]);
    case "k":
      return generateKingMoves(game, idx, piece);
    default:
      return [];
  }
}

function generatePawnMoves(game, idx, piece) {
  const moves = [];
  const color = pieceColor(piece);
  const forward = color === "w" ? -8 : 8;
  const startRank = color === "w" ? 6 : 1;
  const promotionRank = color === "w" ? 0 : 7;
  const rank = Math.floor(idx / 8);
  const toAhead = idx + forward;

  if (toAhead >= 0 && toAhead < 64 && game.board[toAhead] === null) {
    const nextRank = Math.floor(toAhead / 8);
    if (nextRank === promotionRank) {
      ["q", "r", "b", "n"].forEach((p) =>
        moves.push({ from: idx, to: toAhead, piece, promotion: p })
      );
    } else {
      moves.push({ from: idx, to: toAhead, piece });
    }
    const doubleForward = idx + forward * 2;
    if (
      rank === startRank &&
      game.board[doubleForward] === null &&
      game.board[idx + forward] === null
    ) {
      moves.push({ from: idx, to: doubleForward, piece, enPassantTarget: idx + forward });
    }
  }

  const diagOffsets = color === "w" ? [-9, -7] : [9, 7];
  for (const offset of diagOffsets) {
    const target = idx + offset;
    if (target < 0 || target > 63) continue;
    const targetFile = target % 8;
    const file = idx % 8;
    if (Math.abs(targetFile - file) !== 1) continue;
    const occupant = game.board[target];
    if (occupant && pieceColor(occupant) !== color) {
      if (Math.floor(target / 8) === promotionRank) {
        ["q", "r", "b", "n"].forEach((p) =>
          moves.push({ from: idx, to: target, piece, captured: occupant, promotion: p })
        );
      } else {
        moves.push({ from: idx, to: target, piece, captured: occupant });
      }
    }
    if (game.enPassant === target) {
      moves.push({
        from: idx,
        to: target,
        piece,
        captured: color === "w" ? "p" : "P",
        enPassant: true,
      });
    }
  }

  return moves;
}

function generateKnightMoves(game, idx, piece) {
  const moves = [];
  const color = pieceColor(piece);
  const offsets = [15, 17, 10, 6, -15, -17, -10, -6];
  for (const off of offsets) {
    const target = idx + off;
    if (target < 0 || target > 63) continue;
    const file = idx % 8;
    const targetFile = target % 8;
    const rank = Math.floor(idx / 8);
    const targetRank = Math.floor(target / 8);
    const df = Math.abs(file - targetFile);
    const dr = Math.abs(rank - targetRank);
    if (!((df === 1 && dr === 2) || (df === 2 && dr === 1))) continue;
    const occupant = game.board[target];
    if (!occupant || pieceColor(occupant) !== color) {
      moves.push({ from: idx, to: target, piece, captured: occupant || null });
    }
  }
  return moves;
}

function generateSlidingMoves(game, idx, piece, directions) {
  const moves = [];
  const color = pieceColor(piece);

  for (const dir of directions) {
    let from = idx;
    while (true) {
      const to = stepSquare(from, dir);
      if (to === null) break;
      const occupant = game.board[to];
      if (!occupant) {
        moves.push({ from: idx, to, piece });
        from = to;
        continue;
      }
      if (pieceColor(occupant) !== color) {
        moves.push({ from: idx, to, piece, captured: occupant });
      }
      break;
    }
  }
  return moves;
}

function generateKingMoves(game, idx, piece) {
  const moves = [];
  const color = pieceColor(piece);
  const offsets = [1, -1, 8, -8, 7, -7, 9, -9];
  for (const off of offsets) {
    const target = idx + off;
    if (target < 0 || target > 63) continue;
    const file = idx % 8;
    const targetFile = target % 8;
    if (Math.abs(file - targetFile) > 1) continue;
    const occupant = game.board[target];
    if (!occupant || pieceColor(occupant) !== color) {
      moves.push({ from: idx, to: target, piece, captured: occupant || null });
    }
  }

  if (!isInCheck(game, color)) {
    if (
      color === "w" &&
      idx === 60 &&
      game.castling.wK &&
      game.board[61] === null &&
      game.board[62] === null
    ) {
      if (!squareAttacked(game, 61, "b") && !squareAttacked(game, 62, "b")) {
        moves.push({ from: idx, to: 62, piece, castle: "K" });
      }
    }
    if (
      color === "w" &&
      idx === 60 &&
      game.castling.wQ &&
      game.board[59] === null &&
      game.board[58] === null &&
      game.board[57] === null
    ) {
      if (!squareAttacked(game, 59, "b") && !squareAttacked(game, 58, "b")) {
        moves.push({ from: idx, to: 58, piece, castle: "Q" });
      }
    }
    if (
      color === "b" &&
      idx === 4 &&
      game.castling.bK &&
      game.board[5] === null &&
      game.board[6] === null
    ) {
      if (!squareAttacked(game, 5, "w") && !squareAttacked(game, 6, "w")) {
        moves.push({ from: idx, to: 6, piece, castle: "K" });
      }
    }
    if (
      color === "b" &&
      idx === 4 &&
      game.castling.bQ &&
      game.board[1] === null &&
      game.board[2] === null &&
      game.board[3] === null
    ) {
      if (!squareAttacked(game, 2, "w") && !squareAttacked(game, 3, "w")) {
        moves.push({ from: idx, to: 2, piece, castle: "Q" });
      }
    }
  }

  return moves;
}

export function squareAttacked(game, target, attackerColor) {
  const pawnOffsets = attackerColor === "w" ? [-9, -7] : [9, 7];
  for (const off of pawnOffsets) {
    const from = target + off;
    if (from < 0 || from > 63) continue;
    const fileDiff = Math.abs((from % 8) - (target % 8));
    if (fileDiff !== 1) continue;
    const piece = game.board[from];
    if (piece && pieceColor(piece) === attackerColor && piece.toLowerCase() === "p") return true;
  }

  const knightOffsets = [15, 17, 10, 6, -15, -17, -10, -6];
  for (const off of knightOffsets) {
    const from = target + off;
    if (from < 0 || from > 63) continue;
    const df = Math.abs((from % 8) - (target % 8));
    const dr = Math.abs(Math.floor(from / 8) - Math.floor(target / 8));
    if (!((df === 1 && dr === 2) || (df === 2 && dr === 1))) continue;
    const piece = game.board[from];
    if (piece && pieceColor(piece) === attackerColor && piece.toLowerCase() === "n") return true;
  }

  const rookDirs = [1, -1, 8, -8];
  for (const dir of rookDirs) {
    let from = target;
    while (true) {
      const next = stepSquare(from, dir);
      if (next === null) break;
      const occupant = game.board[next];
      if (!occupant) {
        from = next;
        continue;
      }
      if (pieceColor(occupant) === attackerColor) {
        const type = occupant.toLowerCase();
        if (type === "r" || type === "q") return true;
      }
      break;
    }
  }

  const bishopDirs = [7, -7, 9, -9];
  for (const dir of bishopDirs) {
    let from = target;
    while (true) {
      const next = stepSquare(from, dir);
      if (next === null) break;
      const occupant = game.board[next];
      if (!occupant) {
        from = next;
        continue;
      }
      if (pieceColor(occupant) === attackerColor) {
        const type = occupant.toLowerCase();
        if (type === "b" || type === "q") return true;
      }
      break;
    }
  }

  const kingOffsets = [1, -1, 8, -8, 7, -7, 9, -9];
  for (const off of kingOffsets) {
    const from = target + off;
    if (from < 0 || from > 63) continue;
    const df = Math.abs((from % 8) - (target % 8));
    const dr = Math.abs(Math.floor(from / 8) - Math.floor(target / 8));
    if (df <= 1 && dr <= 1) {
      const piece = game.board[from];
      if (piece && pieceColor(piece) === attackerColor && piece.toLowerCase() === "k") return true;
    }
  }
  return false;
}

function findKing(game, color) {
  for (let i = 0; i < 64; i++) {
    const piece = game.board[i];
    if (piece && pieceColor(piece) === color && piece.toLowerCase() === "k") return i;
  }
  return -1;
}

export function isInCheck(game, color) {
  const kingSq = findKing(game, color);
  if (kingSq === -1) return false;
  const attacker = color === "w" ? "b" : "w";
  return squareAttacked(game, kingSq, attacker);
}

export function makeMove(game, move) {
  const next = cloneState(game);
  const movingColor = pieceColor(move.piece);
  next.enPassant = null;
  next.halfmove += 1;
  if (movingColor === "b") next.fullmove += 1;

  const piece = move.piece;
  next.board[move.from] = null;

  if (move.enPassant) {
    const dir = movingColor === "w" ? 8 : -8;
    next.board[move.to + dir] = null;
    next.halfmove = 0;
  }

  if (move.castle) {
    if (movingColor === "w" && move.castle === "K") {
      next.board[63] = null;
      next.board[61] = "R";
    }
    if (movingColor === "w" && move.castle === "Q") {
      next.board[56] = null;
      next.board[59] = "R";
    }
    if (movingColor === "b" && move.castle === "K") {
      next.board[7] = null;
      next.board[5] = "r";
    }
    if (movingColor === "b" && move.castle === "Q") {
      next.board[0] = null;
      next.board[3] = "r";
    }
  }

  const promoted = move.promotion
    ? movingColor === "w"
      ? move.promotion.toUpperCase()
      : move.promotion.toLowerCase()
    : piece;
  next.board[move.to] = promoted;

  if (move.enPassantTarget !== undefined) {
    next.enPassant = move.enPassantTarget;
  }

  if (piece.toLowerCase() === "p" || move.captured) {
    next.halfmove = 0;
  }

  if (piece.toLowerCase() === "k") {
    if (movingColor === "w") {
      next.castling.wK = false;
      next.castling.wQ = false;
    } else {
      next.castling.bK = false;
      next.castling.bQ = false;
    }
  }
  if (piece.toLowerCase() === "r") {
    if (movingColor === "w") {
      if (move.from === 63) next.castling.wK = false;
      if (move.from === 56) next.castling.wQ = false;
    } else {
      if (move.from === 7) next.castling.bK = false;
      if (move.from === 0) next.castling.bQ = false;
    }
  }
  if (move.captured) {
    if (move.to === 63) next.castling.wK = false;
    if (move.to === 56) next.castling.wQ = false;
    if (move.to === 7) next.castling.bK = false;
    if (move.to === 0) next.castling.bQ = false;
  }

  next.turn = movingColor; // keep color, turn not used in realtime mode
  return next;
}

export function evaluateGameEnd(game) {
  // End immediately if any king is missing (captured)
  const whiteKing = game.board.includes("K");
  const blackKing = game.board.includes("k");
  if (!whiteKing) return { title: "Black wins", detail: "White king captured" };
  if (!blackKing) return { title: "White wins", detail: "Black king captured" };
  return null;
}
