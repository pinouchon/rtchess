import {
  state,
  resetGame,
  selectSquare,
  clearSelection,
  setPlayerSide,
  setDifficulty,
  setOrientation,
  applyMove,
  aiMove,
  canSelect,
  legalMoves,
} from "./state.js";
import { pieceColor } from "./rules.js";
import { bindControls, renderAll, showPromotion, updateHighlights } from "./ui.js";

const elements = {};

function getStatusText() {
  if (state.gameOver) return "Game over";
  if (state.game.turn === state.playerSide) return "Your turn";
  return "Thinking...";
}

function getSubStatus() {
  const turn = state.game.turn === "w" ? "White" : "Black";
  return `${turn} to move`;
}

function handleSquareClick(idx) {
  if (state.gameOver) return;
  const piece = state.game.board[idx];
  const turn = state.game.turn;
  const color = pieceColor(piece);

  if (state.selected === null) {
    if (piece && color === turn && color === state.playerSide) {
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

  if (piece && color === turn && color === state.playerSide) {
    selectSquare(idx);
  } else {
    clearSelection();
  }
  renderAll(getStatusText(), getSubStatus());
}

function executeMove(move) {
  const outcome = applyMove(move);
  renderAll(outcome ? outcome.title : getStatusText(), outcome ? outcome.detail : getSubStatus());
  if (outcome) return;

  if (state.game.turn === state.aiSide) {
    renderAll("Thinking...", getSubStatus());
    setTimeout(() => {
      const aiChoice = aiMove();
      if (aiChoice) {
        const aiOutcome = applyMove(aiChoice);
        renderAll(aiOutcome ? aiOutcome.title : getStatusText(), aiOutcome ? aiOutcome.detail : getSubStatus());
      }
    }, 120);
  }
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
  state.orientation = state.playerSide;
  renderAll("Ready", getSubStatus());
  if (state.playerSide === "b") {
    renderAll("Thinking...", "White to move");
    setTimeout(() => {
      const aiChoice = aiMove();
      if (aiChoice) {
        const outcome = applyMove(aiChoice);
        renderAll(outcome ? outcome.title : getStatusText(), outcome ? outcome.detail : getSubStatus());
      }
    }, 150);
  }
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
      setPlayerSide(elements.sideSelect.value);
      newGame();
    },
    onFlip: () => {
      state.orientation = state.orientation === "w" ? "b" : "w";
      renderAll(getStatusText(), getSubStatus());
    },
    onReset: () => {
      setPlayerSide(elements.sideSelect.value);
      newGame();
    },
    onSideChange: (val) => {
      setPlayerSide(val);
      renderAll(getStatusText(), getSubStatus());
    },
    onDifficultyChange: (val) => {
      setDifficulty(val);
      renderAll(getStatusText(), getSubStatus());
    },
    onPromotionChoice: (move) => executeMove(move),
    canDrag: (idx) => canSelect(idx),
  });

  setPlayerSide(elements.sideSelect.value);
  setDifficulty(Number(elements.difficultySelect.value));
  newGame();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
