import {
  state,
  resetGame,
  selectSquare,
  clearSelection,
  setOrientation,
  canSelect,
  processPremoves,
  setMode,
  setRole,
  setGameId,
  setOpponentJoined,
  setGameStarted,
  startInitialCooldowns,
  serverState,
  applyIntent,
  snapshotCore,
  hydrateClientFromCore,
  clearPremove,
} from "./state.js";
import { bindControls, renderAll, showPromotion, updateHighlights, renderBoard } from "./ui.js";

const elements = {};
let currentMode = "gametesting";
let currentRole = "solo";
let currentGameId = null;
let serverAvailable = true;
let statusPoll = null;
const clientId = (() => {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 10);
})();
const incomingMoves = [];
let pendingIntents = [];
let intentSeq = 1;

function logDebug(...args) {
  const el = document.getElementById("debugLog");
  if (!el) return;
  const line = args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch (e) {
        return String(a);
      }
    })
    .join(" ");
  el.value = `${new Date().toISOString()} ${line}\n${el.value}`.slice(0, 8000);
}

function logSync(event, payload) {
  logDebug("[sync]", event, payload);
}

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

function makeIntent(from, to, promotion = null, client = clientId, createdAt = Date.now()) {
  return {
    id: `${client}-${intentSeq++}`,
    clientId: client,
    seq: intentSeq - 1,
    from,
    to,
    promotion: promotion || null,
    createdAt,
  };
}

function reconcileFromServer() {
  const snapshot = snapshotCore(serverState);
  hydrateClientFromCore(snapshot);
  const leftovers = pendingIntents.slice();
  pendingIntents = [];
  leftovers.forEach((intent) => {
    const res = applyIntent(intent, state);
    if (res.accepted) pendingIntents.push(intent);
  });
  logSync("reconcile", {
    pending: pendingIntents.length,
    lastMove: state.lastMove,
    moveHistory: state.moveHistory.slice(-4),
  });
  renderAll(getStatusText(), getSubStatus());
}

function applyServerIntent(intent) {
  const res = applyIntent(intent, serverState, intent.createdAt);
  if (!res.accepted) {
    logSync("server-reject", { intent, reason: res.reason });
    pendingIntents = pendingIntents.filter((i) => i.id !== intent.id);
    reconcileFromServer();
    return;
  }
  logSync("server-accept", { intent, executed: res.executed, premoved: res.premoved });
  processPremoves(serverState, Date.now());
  pendingIntents = pendingIntents.filter((i) => i.id !== intent.id);
  reconcileFromServer();
}

function dispatchIntent(intent) {
  const prediction = applyIntent(intent, state, intent.createdAt);
  if (prediction.accepted) pendingIntents.push(intent);
  logSync("dispatch", {
    intent,
    prediction,
    pending: pendingIntents.length,
    wsConnected,
    mode: currentMode,
  });
  if (
    prediction.accepted &&
    currentMode === "pvp" &&
    wsConnected &&
    ws &&
    intent.clientId === clientId
  ) {
    sendMoveMessage(intent);
  } else if (prediction.accepted && currentMode === "pvp" && intent.clientId === clientId) {
    logSync("ws-send-skip", {
      reason: !wsConnected ? "ws-disconnected" : !ws ? "ws-null" : "mode-not-pvp",
      intent,
    });
  }
  applyServerIntent(intent);
  return prediction;
}

function clearPremoveEverywhere(idx) {
  clearPremove(idx, state);
  clearPremove(idx, serverState);
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
  if (legalMove && legalMove.promotion) {
    showPromotion(legalMove);
    return "promotion";
  }

  const intent = makeIntent(fromIdx, targetIdx, legalMove ? legalMove.promotion : null);
  dispatchIntent(intent);
  clearSelection();
  return "intent";
}

function handleSquareClick(idx) {
  if (state.gameOver) return;
  const piece = state.game.board[idx];

  if (state.selected === null) {
    if (state.premove[idx]) {
      clearPremoveEverywhere(idx);
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
      clearPremoveEverywhere(idx);
    }
    clearSelection();
    renderAll(getStatusText(), getSubStatus());
    return;
  }

  const action = handleMoveIntent(idx);
  if (action === "intent") {
    renderAll(getStatusText(), getSubStatus());
    return;
  }
  if (action === "promotion") return;

  if (piece && canSelect(idx)) {
    selectSquare(idx);
  } else {
    clearSelection();
  }
  renderAll(getStatusText(), getSubStatus());
}

function executeMove(move, isRemote = false, createdAt = Date.now()) {
  const intent = makeIntent(
    move.from,
    move.to,
    move.promotion || null,
    isRemote ? "remote" : clientId,
    createdAt
  );
  if (isRemote) {
    applyServerIntent(intent);
  } else {
    const res = dispatchIntent(intent);
    if (res.accepted) {
      if (currentMode === "pvp" && wsConnected && ws) {
        sendMoveMessage(intent);
      } else {
        logSync("ws-send-skip", {
          reason: !wsConnected ? "ws-disconnected" : currentMode !== "pvp" ? "mode" : "unknown",
          intent,
        });
      }
    }
    logSync("local-move", { intent, result: res });
  }
}

function sendMoveMessage(intent) {
  if (!wsConnected || !ws) return;
  logSync("ws-send-move", { intent, gameId: currentGameId, role: currentRole });
  ws.send(
    JSON.stringify({
      type: "move",
      clientId,
      gameId: currentGameId,
      role: currentRole,
      ts: intent.createdAt || Date.now(),
      move: { from: intent.from, to: intent.to, promotion: intent.promotion || null },
    })
  );
}

function applyRemoteMove(data) {
  const { from, to, promotion, role } = data;
  const intent = makeIntent(from, to, promotion || null, role || "remote", data.ts || Date.now());
  logSync("ws-apply-remote", intent);
  applyServerIntent(intent);
}

function handleDrop(targetIdx) {
  if (state.selected === null) return;
  const action = handleMoveIntent(targetIdx);
  if (action === "intent") {
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
  pendingIntents = [];
  intentSeq = 1;
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
    const target = `${WS_BASE}?game=${encodeURIComponent(gameId)}&role=${role}`;
    logDebug("[ws] connect", target);
    ws = new WebSocket(target);
  } catch (e) {
    serverAvailable = false;
    logDebug("[ws] connect error", e.toString());
    updateInviteUI();
    return;
  }
  ws.onopen = () => {
    wsConnected = true;
    serverAvailable = true;
    logDebug("[ws] open");
    updateInviteUI();
  };
  ws.onclose = () => {
    wsConnected = false;
    serverAvailable = false;
    logDebug("[ws] close");
    updateInviteUI();
  };
  ws.onerror = () => {
    wsConnected = false;
    serverAvailable = false;
    logDebug("[ws] error");
    updateInviteUI();
  };
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      logDebug("[ws] recv", data);
      logSync("ws-recv-any", { data });
      if (data.clientId && data.clientId === clientId) return;
      if (data.type === "move") {
        logSync("ws-recv-move", { data, queueBefore: incomingMoves.length });
        incomingMoves.push({ ...data.move, role: data.role, ts: data.ts });
        return;
      }
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
    logDebug("[mode] host pvp", { gameId: currentGameId });
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
      logDebug("[url] join as guest", { gameId });
      connectWs(gameId, currentRole);
    } else {
      currentRole = "host";
      setRole("host");
      setOrientation("w");
      logDebug("[url] join as host", { gameId });
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
  elements.debugLog = document.getElementById("debugLog");

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
    if (state.dragging) {
      updateHighlights();
      return;
    }
    const res = processPremoves(serverState, Date.now());
    while (incomingMoves.length) {
      const mv = incomingMoves.shift();
      applyRemoteMove(mv);
    }
    if (res.moved) {
      reconcileFromServer();
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
