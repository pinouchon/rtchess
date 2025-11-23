import { state, selectSquare, clearSelection } from "./state.js";
import { FILES, isLightSquare, pieceColor } from "./rules.js";
import { pieceSrc } from "./pieces.js";

let elements = {};
let handlers = {};

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

function indexToDisplayRC(idx) {
  const rank = Math.floor(idx / 8);
  const file = idx % 8;
  if (state.orientation === "w") return { row: rank, col: file };
  return { row: 7 - rank, col: 7 - file };
}

function pointerToBoardIdx(clientX, clientY) {
  const rect = elements.board.getBoundingClientRect();
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
  handlers.onDrop(targetIdx);
  state.dragging = null;
  state.dragFrom = null;
  state.hoverTarget = null;
}

function startPointerDrag(event, idx, pieceEl) {
  if (event.button !== undefined && event.button !== 0) return;
  if (!handlers.canDrag(idx)) return;
  event.preventDefault();
  selectSquare(idx);
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

export function updateHighlights() {
  if (!elements.board) return;
  const targetSquares = new Set(state.legalMoves.map((m) => m.to));
  const captureSquares = new Set(state.legalMoves.filter((m) => m.captured).map((m) => m.to));
  elements.board.querySelectorAll(".square").forEach((square) => {
    const idx = Number(square.dataset.square);
    square.classList.remove("highlight", "target", "capture", "hover-target");
    if (state.selected === idx) square.classList.add("highlight");
    if (state.lastMove && (state.lastMove.from === idx || state.lastMove.to === idx)) {
      square.classList.add("last-move");
    }
    if (state.selected !== null && targetSquares.has(idx)) {
      square.classList.add("target");
      if (captureSquares.has(idx)) square.classList.add("capture");
    }
    if (state.hoverTarget === idx) square.classList.add("hover-target");
    if (state.inCheck.w && state.game.board[idx] === "K") square.classList.add("check");
    if (state.inCheck.b && state.game.board[idx] === "k") square.classList.add("check");
  });
}

export function renderBoard() {
  elements.board.innerHTML = "";
  const displaySquares = getDisplayOrder();
  const targetSquares = new Set(state.legalMoves.map((m) => m.to));
  const captureSquares = new Set(state.legalMoves.filter((m) => m.captured).map((m) => m.to));
  const now = Date.now();
  const premoveList = state.premove.filter(Boolean);

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
      if (captureSquares.has(idx)) square.classList.add("capture");
    }
    if (state.hoverTarget === idx) square.classList.add("hover-target");
    if (state.inCheck.w && state.game.board[idx] === "K") square.classList.add("check");
    if (state.inCheck.b && state.game.board[idx] === "k") square.classList.add("check");

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

      const cd = state.cooldowns[idx];
      if (cd && cd.until > now) {
        const pct = Math.max(0, Math.min(1, (cd.until - now) / cd.duration));
        const cooldownEl = document.createElement("div");
        cooldownEl.className = "cooldown";
        cooldownEl.style.setProperty("--pct", pct);
        pieceEl.appendChild(cooldownEl);
      }
      square.appendChild(pieceEl);
    }

    square.addEventListener("click", () => handlers.onSquareClick(idx));
    elements.board.appendChild(square);
  });

  if (premoveList.length) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "premove-layer");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    premoveList.forEach((pm) => {
      const fromRC = indexToDisplayRC(pm.from);
      const toRC = indexToDisplayRC(pm.to);
      const x1 = ((fromRC.col + 0.5) / 8) * 100;
      const y1 = ((fromRC.row + 0.5) / 8) * 100;
      const x2 = ((toRC.col + 0.5) / 8) * 100;
      const y2 = ((toRC.row + 0.5) / 8) * 100;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("class", "premove-arrow-line");
      const head = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      head.setAttribute("cx", x2);
      head.setAttribute("cy", y2);
      head.setAttribute("r", "1.4");
      head.setAttribute("class", "premove-arrow-head");
      svg.appendChild(line);
      svg.appendChild(head);
    });
    elements.board.appendChild(svg);
  }
}

export function renderStatus(text, subText) {
  elements.statusText.textContent = text;
  elements.subStatus.textContent = subText || "";
  elements.turnDot.style.background = state.game.turn === "w" ? "var(--accent)" : "#f9d66d";
  elements.playerSideLabel.textContent = "Both";
  elements.difficultyLabel.textContent = "N/A";
}

export function renderMoveList() {
  elements.moveList.innerHTML = "";
  state.moveHistory.forEach((entry, idx) => {
    const li = document.createElement("li");
    const moveNumber = Math.floor(idx / 2) + 1;
    const prefix = idx % 2 === 0 ? `${moveNumber}. ` : "";
    li.textContent = `${prefix}${entry}`;
    elements.moveList.appendChild(li);
  });
}

export function showPromotion(move) {
  elements.promotionOverlay.classList.remove("hidden");
  const buttons = Array.from(elements.promotionOverlay.querySelectorAll(".promo-btn"));
  const handler = (event) => {
    const choice = event.currentTarget.dataset.piece;
    elements.promotionOverlay.classList.add("hidden");
    buttons.forEach((b) => b.removeEventListener("click", handler));
    handlers.onPromotionChoice({ ...move, promotion: choice });
  };
  buttons.forEach((btn) => btn.addEventListener("click", handler));
}

export function bindControls(dom, controlHandlers) {
  elements = dom;
  handlers = controlHandlers;

  dom.newGameBtn.addEventListener("click", handlers.onNewGame);
  dom.flipBtn.addEventListener("click", handlers.onFlip);
  dom.resetBtn.addEventListener("click", handlers.onReset);
  dom.sideSelect.addEventListener("change", (e) => handlers.onSideChange(e.target.value));
  dom.difficultySelect.addEventListener("change", (e) =>
    handlers.onDifficultyChange(Number(e.target.value))
  );
}

export function renderAll(statusText, subText) {
  renderBoard();
  renderMoveList();
  renderStatus(statusText, subText);
}
