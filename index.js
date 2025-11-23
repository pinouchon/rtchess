import {
  state,
  resetGame,
  selectSquare,
  clearSelection,
  setOrientation,
  applyMove,
  canSelect,
  isOnCooldown,
  setPremove,
  clearPremove,
  processPremoves,
  setMode,
  setRole,
  setGameId,
  setOpponentJoined,
  setGameStarted,
  startInitialCooldowns,
} from "./state.js";
import { pieceColor } from "./rules.js";
import { bindControls, renderAll, showPromotion, updateHighlights, renderBoard } from "./ui.js";

const elements = {};
let currentMode = "gametesting";
let currentRole = "solo";
let currentGameId = null;
let serverAvailable = true;
let statusPoll = null;

function getStatusText() {
  return state.gameOver ? "Game over" : currentMode === "pvp" ? "PvP setup" : "Free play";
}

function getSubStatus() {
  if (currentMode === "pvp") {
    if (!state.session.opponentJoined) return "Waiting for opponent to join";
    if (!state.session.gameStarted) return "Opponent joined - host can start";
    return currentRole === "host" ? "You play White" : "You play Black";
  }
  return "Move any ready piece";
}

function isValidTarget(idx) {
  return state.patternMoves.some((m) => m.to === idx);
}

function findLegalMove(idx) {
  return state.legalMoves.find((m) => m.to === idx);
}

function handleMoveIntent(targetIdx) {
  const fromIdx = state.selected;
  if (fromIdx === null) return "none";
  if (!isValidTarget(targetIdx)) return "none";

  const legalMove = findLegalMove(targetIdx);
  const onCooldown = isOnCooldown(fromIdx);

  if (!onCooldown && legalMove) {
    if (legalMove.promotion) {
      showPromotion(legalMove);
      return "promotion";
    }
    executeMove(legalMove);
    return "move";
  }

  const piece = state.game.board[fromIdx];
  if (!piece) return "none";
  setPremove({
    from: fromIdx,
    to: targetIdx,
    piece,
    promotion: legalMove ? legalMove.promotion : null,
  });
  clearSelection();
  return "premove";
}

function handleSquareClick(idx) {
  if (state.gameOver) return;
  const piece = state.game.board[idx];

  if (state.selected === null) {
    if (state.premove[idx]) {
      clearPremove(idx);
      renderAll(getStatusText(), getSubStatus());
      return;
    }
    if (piece && canSelect(idx)) {
      selectSquare(idx);
      renderAll(getStatusText(), getSubStatus());
      return;
    }
    renderAll(getStatusText(), getSubStatus());
    return;
  }

  if (state.selected === idx) {
    if (state.premove[idx]) {
      clearPremove(idx);
    }
    clearSelection();
    renderAll(getStatusText(), getSubStatus());
    return;
  }

  const action = handleMoveIntent(idx);
  if (action === "premove") {
    renderAll(getStatusText(), getSubStatus());
    return;
  }
  if (action === "move" || action === "promotion") return;

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
  const action = handleMoveIntent(targetIdx);
  if (action === "premove") {
    renderAll(getStatusText(), getSubStatus());
  } else if (action === "none") {
    renderAll(getStatusText(), getSubStatus());
  }
}

function newGame() {
  if (currentMode === "pvp") {
    setGameStarted(false);
  }
  resetGame();
  state.orientation = currentRole === "guest" ? "b" : "w";
  renderAll("Ready", getSubStatus());
}

function makeGameId() {
  return Math.random().toString(36).slice(2, 10);
}

function buildInviteLink(gameId) {
  const url = new URL(window.location.href);
  url.searchParams.set("game", gameId);
  url.searchParams.set("role", "guest");
  return url.toString();
}

const WS_BASE = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
let ws = null;
let wsConnected = false;

function updateModePill() {
  const pill = elements.modePill;
  pill.textContent =
    currentMode === "pvp" ? "Realtime chess - PvP" : "Realtime chess - gametesting";
}

function disconnectWs() {
  if (ws) {
    ws.close();
    ws = null;
  }
  wsConnected = false;
  serverAvailable = true;
}

function connectWs(gameId, role) {
  disconnectWs();
  try {
    ws = new WebSocket(`${WS_BASE}?game=${encodeURIComponent(gameId)}&role=${role}`);
  } catch (e) {
    serverAvailable = false;
    updateInviteUI();
    return;
  }
  ws.onopen = () => {
    wsConnected = true;
    serverAvailable = true;
    updateInviteUI();
  };
  ws.onclose = () => {
    wsConnected = false;
    serverAvailable = false;
    updateInviteUI();
  };
  ws.onerror = () => {
    wsConnected = false;
    serverAvailable = false;
    updateInviteUI();
  };
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data.type === "state" && data.state) {
        const wasStarted = state.session.gameStarted;
        setOpponentJoined(!!data.state.guest);
        setGameStarted(!!data.state.started);
        if (data.state.started && !wasStarted) startInitialCooldowns();
        updateInviteUI();
        renderAll(getStatusText(), getSubStatus());
      }
      if (data.type === "joined") {
        setOpponentJoined(true);
        updateInviteUI();
        renderAll(getStatusText(), getSubStatus());
      }
      if (data.type === "started") {
        const wasStarted = state.session.gameStarted;
        setGameStarted(true);
        if (!wasStarted) startInitialCooldowns();
        updateInviteUI();
        renderAll("Game started", getSubStatus());
      }
    } catch (err) {
      // ignore parse errors
    }
  };
}

function updateInviteUI() {
  const panel = elements.pvpPanel;
  if (currentMode !== "pvp") {
    panel.classList.add("hidden");
    elements.startGameBtn.disabled = true;
    elements.pvpStatus.textContent = "";
    return;
  }
  panel.classList.remove("hidden");
  const link = buildInviteLink(currentGameId);
  elements.inviteLink.value = link;
  const isHost = currentRole === "host";
  elements.startGameBtn.textContent = "Start game";
  elements.startGameBtn.disabled = !isHost || !state.session.opponentJoined || state.session.gameStarted;
  elements.startGameBtn.classList.toggle("hidden", !isHost);
  if (!serverAvailable) {
    elements.pvpStatus.textContent = "PvP server unavailable. Run node server.js";
    return;
  }
  elements.pvpStatus.textContent = state.session.opponentJoined
    ? state.session.gameStarted
      ? "Game started"
      : isHost
        ? "Opponent has joined. Host can start."
        : "Waiting for host to start the game."
    : isHost
      ? "Waiting for opponent to join"
      : "Waiting for host to start the game.";
}

function updateMode(newMode) {
  currentMode = newMode;
  setMode(newMode);
  updateModePill();
  elements.modeSelect.value = newMode;
  if (newMode === "pvp") {
    if (!currentGameId) {
      currentGameId = makeGameId();
      setGameId(currentGameId);
      const url = new URL(window.location.href);
      url.searchParams.set("game", currentGameId);
      url.searchParams.delete("role");
      window.history.replaceState({}, "", url.toString());
    }
    currentRole = "host";
    setRole("host");
    setOrientation("w");
    setOpponentJoined(false);
    setGameStarted(false);
    connectWs(currentGameId, currentRole);
  } else {
    currentRole = "solo";
    setRole("solo");
    setOpponentJoined(false);
    setGameStarted(false);
    currentGameId = null;
    setGameId(null);
    disconnectWs();
  }
  newGame();
  updateInviteUI();
}

function initFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const gameId = params.get("game");
  const role = params.get("role");
  if (gameId) {
    currentGameId = gameId;
    setGameId(gameId);
    currentMode = "pvp";
    setMode("pvp");
    if (role === "guest") {
      currentRole = "guest";
      setRole("guest");
      setOrientation("b");
      connectWs(gameId, currentRole);
    } else {
      currentRole = "host";
      setRole("host");
      setOrientation("w");
      connectWs(gameId, currentRole);
    }
  }
}

function init() {
  elements.board = document.getElementById("board");
  elements.moveList = document.getElementById("moveList");
  elements.statusText = document.getElementById("statusText");
  elements.subStatus = document.getElementById("subStatus");
  elements.turnDot = document.getElementById("turnDot");
  elements.modePill = document.getElementById("modePill");
  elements.playerSideLabel = document.getElementById("playerSideLabel");
  elements.difficultyLabel = document.getElementById("difficultyLabel");
  elements.promotionOverlay = document.getElementById("promotionOverlay");
  elements.sideSelect = document.getElementById("sideSelect");
  elements.difficultySelect = document.getElementById("difficultySelect");
  elements.newGameBtn = document.getElementById("newGameBtn");
  elements.flipBtn = document.getElementById("flipBtn");
  elements.resetBtn = document.getElementById("resetBtn");
  elements.modeSelect = document.getElementById("modeSelect");
  elements.pvpPanel = document.getElementById("pvpPanel");
  elements.inviteLink = document.getElementById("inviteLink");
  elements.copyInviteBtn = document.getElementById("copyInviteBtn");
  elements.pvpStatus = document.getElementById("pvpStatus");
  elements.startGameBtn = document.getElementById("startGameBtn");
  elements.soloOptions = document.getElementById("soloOptions");

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

  initFromUrl();
  updateModePill();
  updateInviteUI();
  if (currentMode !== "pvp") {
    setOrientation("w");
  }
  elements.modeSelect.value = currentMode;
  elements.soloOptions.classList.toggle("hidden", currentMode === "pvp");

  elements.modeSelect.addEventListener("change", (e) => {
    updateMode(e.target.value);
    elements.soloOptions.classList.toggle("hidden", e.target.value === "pvp");
  });

  elements.copyInviteBtn.addEventListener("click", () => {
    elements.inviteLink.select();
    document.execCommand("copy");
  });

  elements.startGameBtn.addEventListener("click", () => {
    if (currentRole !== "host") return;
    setGameStarted(true);
    startInitialCooldowns();
    updateInviteUI();
    renderAll("Game started", getSubStatus());
    if (wsConnected && ws) {
      ws.send(JSON.stringify({ type: "start", gameId: currentGameId }));
    }
  });

  newGame();

  setInterval(() => {
    const res = processPremoves();
    if (res.moved) {
      renderAll(res.outcome ? res.outcome.title : getStatusText(), res.outcome ? res.outcome.detail : getSubStatus());
    } else {
      renderBoard();
      updateHighlights();
    }
  }, 60);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
