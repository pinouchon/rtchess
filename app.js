const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"]; // 0 = a8, 63 = h1

// Piece images (svg files live under assets/pieces)
const PIECE_IMAGES = {
  wP: "assets/pieces/wP.svg",
  wR: "assets/pieces/wR.svg",
  wN: "assets/pieces/wN.svg",
  wB: "assets/pieces/wB.svg",
  wQ: "assets/pieces/wQ.svg",
  wK: "assets/pieces/wK.svg",
  bP: "assets/pieces/bP.svg",
  bR: "assets/pieces/bR.svg",
  bN: "assets/pieces/bN.svg",
  bB: "assets/pieces/bB.svg",
  bQ: "assets/pieces/bQ.svg",
  bK: "assets/pieces/bK.svg",
};

const MATERIAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const initialBoard = () => [
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

const newState = () => ({
  board: initialBoard(),
  turn: "w",
  castling: { wK: true, wQ: true, bK: true, bQ: true },
  enPassant: null,
  halfmove: 0,
  fullmove: 1,
});

const state = {
  game: newState(),
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
};

let boardEl;
let moveListEl;
let statusTextEl;
let subStatusEl;
let turnDotEl;
let playerSideLabelEl;
let difficultyLabelEl;
let promotionOverlayEl;
let sideSelectEl;
let difficultySelectEl;
let newGameBtn;
let flipBtn;
let resetBtn;

function pieceColor(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? "w" : "b";
}

function idxToSquare(idx) {
  const file = FILES[idx % 8];
  const rank = 8 - Math.floor(idx / 8);
  return `${file}${rank}`;
}

function isLightSquare(idx) {
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

function cloneState(game) {
  return {
    board: game.board.slice(),
    turn: game.turn,
    castling: { ...game.castling },
    enPassant: game.enPassant,
    halfmove: game.halfmove,
    fullmove: game.fullmove,
  };
}

function getDisplayOrder() {
  const order = [];
  if (state.orientation === "w") {
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        order.push(rank * 8 + file);
      }
    }
  } else {
    for (let rank = 7; rank >= 0; rank--) {
      for (let file = 7; file >= 0; file--) {
        order.push(rank * 8 + file);
      }
    }
  }
  return order;
}

function pieceSrc(piece) {
  const color = pieceColor(piece);
  const type = piece.toUpperCase();
  return PIECE_IMAGES[`${color}${type}`];
}

function renderBoard() {
  boardEl.innerHTML = "";
  const displaySquares = getDisplayOrder();
  const targetSquares = new Set(state.legalMoves.map((m) => m.to));

  displaySquares.forEach((idx) => {
    const square = document.createElement("div");
    square.className = `square ${isLightSquare(idx) ? "light" : "dark"}`;
    square.dataset.square = idx;

    if (state.selected === idx) square.classList.add("highlight");
    if (state.lastMove && (state.lastMove.from === idx || state.lastMove.to === idx)) {
      square.classList.add("last-move");
    }
    if (state.selected !== null && targetSquares.has(idx)) {
      square.classList.add("target");
      const occupying = state.game.board[idx];
      if (occupying) square.classList.add("capture");
    }

    const rank = Math.floor(idx / 8);
    const file = idx % 8;
    const shouldShowFile =
      (state.orientation === "w" && rank === 7) || (state.orientation === "b" && rank === 0);
    const shouldShowRank =
      (state.orientation === "w" && file === 0) || (state.orientation === "b" && file === 7);
    if (shouldShowFile || shouldShowRank) {
      const label = document.createElement("div");
      label.className = "coordinate";
      const rankLabel = 8 - rank;
      const fileLabel = FILES[file];
      label.textContent = shouldShowFile && shouldShowRank ? `${fileLabel}${rankLabel}` : shouldShowFile ? fileLabel : rankLabel;
      square.appendChild(label);
    }

    const piece = state.game.board[idx];
    if (piece) {
      const pieceEl = document.createElement("div");
      pieceEl.className = `piece ${pieceColor(piece) === "w" ? "white" : "black"}`;
      pieceEl.setAttribute("draggable", "false");
      const img = document.createElement("img");
      img.src = pieceSrc(piece);
      img.alt = piece;
      pieceEl.appendChild(img);
      pieceEl.addEventListener("pointerdown", (e) => startPointerDrag(e, idx, pieceEl));
      square.appendChild(pieceEl);
    }

    square.addEventListener("click", () => onSquareClick(idx));
    boardEl.appendChild(square);
  });
}

function updateHighlights() {
  if (!boardEl) return;
  const targetSquares = new Set(state.legalMoves.map((m) => m.to));
  boardEl.querySelectorAll(".square").forEach((square) => {
    const idx = Number(square.dataset.square);
    square.classList.remove("highlight", "target", "capture", "hover-target");
    if (state.selected === idx) square.classList.add("highlight");
    if (state.lastMove && (state.lastMove.from === idx || state.lastMove.to === idx)) {
      square.classList.add("last-move");
    }
    if (state.selected !== null && targetSquares.has(idx)) {
      square.classList.add("target");
      const occupying = state.game.board[idx];
      if (occupying) square.classList.add("capture");
    }
    if (state.hoverTarget === idx) {
      square.classList.add("hover-target");
    }
  });
}

function renderStatus(text, subText) {
  statusTextEl.textContent = text;
  subStatusEl.textContent = subText || "";
  turnDotEl.style.background = state.game.turn === "w" ? "var(--accent)" : "#f9d66d";
  playerSideLabelEl.textContent = state.playerSide === "w" ? "White" : "Black";
  difficultyLabelEl.textContent =
    state.difficulty === 1 ? "Casual" : state.difficulty === 2 ? "Normal" : "Thinking";
}

function renderMoveList() {
  moveListEl.innerHTML = "";
  state.moveHistory.forEach((entry, idx) => {
    const li = document.createElement("li");
    const moveNumber = Math.floor(idx / 2) + 1;
    const prefix = idx % 2 === 0 ? `${moveNumber}. ` : "";
    li.textContent = `${prefix}${entry}`;
    moveListEl.appendChild(li);
  });
}

function onSquareClick(idx) {
  if (state.gameOver) return;
  const piece = state.game.board[idx];
  const turn = state.game.turn;
  const color = pieceColor(piece);

  if (state.selected === null) {
    if (piece && color === turn && color === state.playerSide) {
      selectSquare(idx);
    }
    return;
  }

  if (state.selected === idx) {
    clearSelection();
    return;
  }

  const chosenMove = state.legalMoves.find((m) => m.to === idx);
  if (chosenMove) {
    if (chosenMove.promotion) {
      openPromotion(chosenMove);
    } else {
      playMove(chosenMove);
    }
    return;
  }

  if (piece && color === turn && color === state.playerSide) {
    selectSquare(idx);
  } else {
    clearSelection();
  }
}

function clearSelection() {
  state.selected = null;
  state.legalMoves = [];
  state.hoverTarget = null;
  renderBoard();
}

function selectSquare(idx) {
  state.selected = idx;
  state.legalMoves = generateLegalMoves(state.game).filter((m) => m.from === idx);
  renderBoard();
}

function pointerToBoardIdx(clientX, clientY) {
  const rect = boardEl.getBoundingClientRect();
  const squareSize = rect.width / 8;
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
  const file = Math.floor(x / squareSize);
  const rank = Math.floor(y / squareSize);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  const displaySquares = getDisplayOrder();
  const pos = rank * 8 + file;
  return displaySquares[pos];
}

function createDragGhost(pieceEl) {
  const rect = pieceEl.getBoundingClientRect();
  const ghost = pieceEl.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.style.position = "fixed";
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.pointerEvents = "none";
  ghost.style.zIndex = "50";
  document.body.appendChild(ghost);
  return ghost;
}

function startPointerDrag(event, idx, pieceEl) {
  if (event.button !== undefined && event.button !== 0) return;
  if (state.gameOver) return;
  const piece = state.game.board[idx];
  if (!piece || pieceColor(piece) !== state.game.turn || pieceColor(piece) !== state.playerSide) {
    return;
  }
  event.preventDefault();
  state.dragFrom = idx;
  state.selected = idx;
  state.legalMoves = generateLegalMoves(state.game).filter((m) => m.from === idx);
  state.hoverTarget = null;
  const ghost = createDragGhost(pieceEl);
  const rect = pieceEl.getBoundingClientRect();
  pieceEl.classList.add("lifted");
  state.dragging = {
    from: idx,
    ghost,
    pieceEl,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  };
  updateGhostPosition(event);
  updateHighlights();
  window.addEventListener("pointermove", onPointerMoveDrag);
  window.addEventListener("pointerup", onPointerUpDrag);
}

function updateGhostPosition(event) {
  if (!state.dragging) return;
  const { ghost, offsetX, offsetY } = state.dragging;
  ghost.style.left = `${event.clientX - offsetX}px`;
  ghost.style.top = `${event.clientY - offsetY}px`;
}

function onPointerMoveDrag(event) {
  if (!state.dragging) return;
  event.preventDefault();
  updateGhostPosition(event);
  const targetIdx = pointerToBoardIdx(event.clientX, event.clientY);
  const legalTargets = new Set(state.legalMoves.map((m) => m.to));
  state.hoverTarget = targetIdx !== null && legalTargets.has(targetIdx) ? targetIdx : null;
  updateHighlights();
}

function onPointerUpDrag(event) {
  if (!state.dragging) return;
  const { ghost, pieceEl } = state.dragging;
  ghost.remove();
  pieceEl.classList.remove("lifted");
  window.removeEventListener("pointermove", onPointerMoveDrag);
  window.removeEventListener("pointerup", onPointerUpDrag);

  const targetIdx = pointerToBoardIdx(event.clientX, event.clientY);
  const chosenMove = state.legalMoves.find((m) => m.to === targetIdx);
  state.dragging = null;
  state.dragFrom = null;
  state.hoverTarget = null;
  if (!chosenMove) {
    clearSelection();
    return;
  }
  if (chosenMove.promotion) {
    openPromotion(chosenMove);
  } else {
    playMove(chosenMove);
  }
}

function openPromotion(move) {
  promotionOverlayEl.classList.remove("hidden");
  const buttons = Array.from(promotionOverlayEl.querySelectorAll(".promo-btn"));
  const handler = (event) => {
    const choice = event.currentTarget.dataset.piece;
    promotionOverlayEl.classList.add("hidden");
    buttons.forEach((b) => b.removeEventListener("click", handler));
    playMove({ ...move, promotion: choice });
  };
  buttons.forEach((btn) => btn.addEventListener("click", handler));
}

function playMove(move) {
  state.game = makeMove(state.game, move);
  state.lastMove = { from: move.from, to: move.to };
  state.moveHistory.push(moveToString(move));
  state.selected = null;
  state.legalMoves = [];
  const outcome = evaluateGameEnd(state.game);
  if (outcome) {
    state.gameOver = true;
    renderStatus(outcome.title, outcome.detail);
    renderMoveList();
    renderBoard();
    return;
  }
  renderMoveList();
  renderBoard();

  if (state.game.turn === state.aiSide) {
    renderStatus("Thinking...", `${sideName(state.game.turn)} to move`);
    setTimeout(() => aiMove(), 120);
  } else {
    renderStatus("Your turn", `${sideName(state.game.turn)} to move`);
  }
}

function aiMove() {
  if (state.gameOver || state.game.turn !== state.aiSide) return;
  const legal = generateLegalMoves(state.game);
  if (!legal.length) return;
  const depth = state.difficulty + 1;
  const best = findBestMove(state.game, depth, state.aiSide);
  const move = best || legal[Math.floor(Math.random() * legal.length)];
  playMove(move);
}

function resetGame() {
  state.game = newState();
  state.selected = null;
  state.legalMoves = [];
  state.lastMove = null;
  state.moveHistory = [];
  state.gameOver = false;
  renderBoard();
  renderMoveList();
  renderStatus("Ready", `${sideName(state.game.turn)} to move`);
}

function newGame() {
  state.orientation = state.playerSide;
  resetGame();
  if (state.playerSide === "b") {
    renderStatus("Thinking...", "White to move");
    setTimeout(() => aiMove(), 150);
  } else {
    renderStatus("Your turn", `${sideName(state.game.turn)} to move`);
  }
}

function sideName(color) {
  return color === "w" ? "White" : "Black";
}

function moveToString(move) {
  const piece = move.piece.toLowerCase();
  const promo = move.promotion ? `=${move.promotion.toUpperCase()}` : "";
  const capture = move.captured ? "x" : "-";
  const notation = `${piece === "p" ? "" : move.piece.toUpperCase()}${idxToSquare(move.from)}${capture}${idxToSquare(move.to)}${promo}`;
  return notation;
}

function evaluateGameEnd(game) {
  const legal = generateLegalMoves(game);
  if (legal.length === 0) {
    const inCheck = isInCheck(game, game.turn);
    return inCheck
      ? { title: "Checkmate", detail: `${sideName(game.turn)} is mated` }
      : { title: "Stalemate", detail: "No legal moves" };
  }
  if (game.halfmove >= 100) {
    return { title: "Draw", detail: "50-move rule" };
  }
  return null;
}

function generateLegalMoves(game) {
  const moves = [];
  for (let i = 0; i < 64; i++) {
    const piece = game.board[i];
    if (!piece || pieceColor(piece) !== game.turn) continue;
    moves.push(...generateMovesFromSquare(game, i, piece));
  }
  return moves.filter((mv) => {
    const next = makeMove(game, mv);
    return !isInCheck(next, game.turn);
  });
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

function squareAttacked(game, target, attackerColor) {
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

function isInCheck(game, color) {
  const kingSq = findKing(game, color);
  if (kingSq === -1) return false;
  const attacker = color === "w" ? "b" : "w";
  return squareAttacked(game, kingSq, attacker);
}

function makeMove(game, move) {
  const next = cloneState(game);
  const movingColor = pieceColor(move.piece);
  const opponent = movingColor === "w" ? "b" : "w";
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

  next.turn = opponent;
  return next;
}

function evaluateBoard(game) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const piece = game.board[i];
    if (!piece) continue;
    const val = MATERIAL[piece.toLowerCase()];
    score += pieceColor(piece) === "w" ? val : -val;
  }
  return score;
}

function evaluatePosition(game, outcome, depth) {
  if (outcome?.title === "Checkmate") {
    const winner = game.turn === "w" ? "b" : "w";
    const mateValue = 100000 - depth * 100;
    return winner === "w" ? mateValue : -mateValue;
  }
  if (outcome?.title === "Stalemate" || outcome?.title === "Draw") return 0;
  return evaluateBoard(game);
}

function findBestMove(game, depth, aiColor) {
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

function bindControls() {
  newGameBtn.addEventListener("click", () => {
    state.playerSide = sideSelectEl.value;
    state.aiSide = state.playerSide === "w" ? "b" : "w";
    newGame();
  });

  flipBtn.addEventListener("click", () => {
    state.orientation = state.orientation === "w" ? "b" : "w";
    renderBoard();
  });

  resetBtn.addEventListener("click", () => {
    state.playerSide = sideSelectEl.value;
    state.aiSide = state.playerSide === "w" ? "b" : "w";
    newGame();
  });

  sideSelectEl.addEventListener("change", () => {
    state.playerSide = sideSelectEl.value;
    state.aiSide = state.playerSide === "w" ? "b" : "w";
    playerSideLabelEl.textContent = sideName(state.playerSide);
  });

  difficultySelectEl.addEventListener("change", () => {
    state.difficulty = Number(difficultySelectEl.value);
    difficultyLabelEl.textContent =
      state.difficulty === 1 ? "Casual" : state.difficulty === 2 ? "Normal" : "Thinking";
  });
}

function init() {
  boardEl = document.getElementById("board");
  moveListEl = document.getElementById("moveList");
  statusTextEl = document.getElementById("statusText");
  subStatusEl = document.getElementById("subStatus");
  turnDotEl = document.getElementById("turnDot");
  playerSideLabelEl = document.getElementById("playerSideLabel");
  difficultyLabelEl = document.getElementById("difficultyLabel");
  promotionOverlayEl = document.getElementById("promotionOverlay");
  sideSelectEl = document.getElementById("sideSelect");
  difficultySelectEl = document.getElementById("difficultySelect");
  newGameBtn = document.getElementById("newGameBtn");
  flipBtn = document.getElementById("flipBtn");
  resetBtn = document.getElementById("resetBtn");

  if (
    !boardEl ||
    !moveListEl ||
    !statusTextEl ||
    !subStatusEl ||
    !turnDotEl ||
    !playerSideLabelEl ||
    !difficultyLabelEl ||
    !promotionOverlayEl ||
    !sideSelectEl ||
    !difficultySelectEl ||
    !newGameBtn ||
    !flipBtn ||
    !resetBtn
  ) {
    console.error("Missing UI elements");
    return;
  }

  bindControls();
  state.playerSide = sideSelectEl.value;
  state.aiSide = state.playerSide === "w" ? "b" : "w";
  state.difficulty = Number(difficultySelectEl.value);
  newGame();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
