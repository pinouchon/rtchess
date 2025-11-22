import {
  state,
  resetGame,
  selectSquare,
  clearSelection,
  setOrientation,
  applyMove,
  canSelect,
} from "./state.js";
import { pieceColor } from "./rules.js";
import { bindControls, renderAll, showPromotion, updateHighlights, renderBoard } from "./ui.js";

const elements = {};

function getStatusText() {
  return state.gameOver ? "Game over" : "Free play";
}

function getSubStatus() {
  return "Move any ready piece";
}

function handleSquareClick(idx) {
  if (state.gameOver) return;
  const piece = state.game.board[idx];

  if (state.selected === null) {
    if (piece && canSelect(idx)) {
      selectSquare(idx);
      renderAll(getStatusText(), getSubStatus());
    }
    return;
  }

  if (state.selected === idx) {
    clearSelection();
    renderAll(getStatusText(), getSubStatus());
    return;
  }

  const chosenMove = state.legalMoves.find((m) => m.to === idx);
  if (chosenMove) {
    if (chosenMove.promotion) {
      showPromotion(chosenMove);
    } else {
      executeMove(chosenMove);
    }
    return;
  }

  if (piece && canSelect(idx)) {
    selectSquare(idx);
  } else {
    clearSelection();
  }
  renderAll(getStatusText(), getSubStatus());
}

function executeMove(move) {
  const outcome = applyMove(move);
  renderAll(outcome ? outcome.title : getStatusText(), outcome ? outcome.detail : getSubStatus());
}

function handleDrop(targetIdx) {
  if (state.selected === null) return;
  const chosenMove = state.legalMoves.find((m) => m.to === targetIdx);
  if (!chosenMove) {
    clearSelection();
    renderAll(getStatusText(), getSubStatus());
    return;
  }
  if (chosenMove.promotion) {
    showPromotion(chosenMove);
  } else {
    executeMove(chosenMove);
  }
}

function newGame() {
  resetGame();
  state.orientation = "w";
  renderAll("Ready", getSubStatus());
}

function init() {
  elements.board = document.getElementById("board");
  elements.moveList = document.getElementById("moveList");
  elements.statusText = document.getElementById("statusText");
  elements.subStatus = document.getElementById("subStatus");
  elements.turnDot = document.getElementById("turnDot");
  elements.playerSideLabel = document.getElementById("playerSideLabel");
  elements.difficultyLabel = document.getElementById("difficultyLabel");
  elements.promotionOverlay = document.getElementById("promotionOverlay");
  elements.sideSelect = document.getElementById("sideSelect");
  elements.difficultySelect = document.getElementById("difficultySelect");
  elements.newGameBtn = document.getElementById("newGameBtn");
  elements.flipBtn = document.getElementById("flipBtn");
  elements.resetBtn = document.getElementById("resetBtn");

  bindControls(elements, {
    onSquareClick: handleSquareClick,
    onDrop: handleDrop,
    onNewGame: () => {
      newGame();
    },
    onFlip: () => {
      state.orientation = state.orientation === "w" ? "b" : "w";
      renderAll(getStatusText(), getSubStatus());
    },
    onReset: () => {
      newGame();
    },
    onSideChange: () => {},
    onDifficultyChange: () => {},
    onPromotionChoice: (move) => executeMove(move),
    canDrag: (idx) => canSelect(idx),
  });

  elements.sideSelect.disabled = true;
  elements.difficultySelect.disabled = true;
  newGame();

  setInterval(() => {
    renderBoard();
    updateHighlights();
  }, 60);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
