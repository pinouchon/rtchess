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
  setGameState,
  startInitialCooldowns,
  serverState,
  applyIntent,
  snapshotCore,
  hydrateClientFromCore,
  clearPremove,
  forceOutcome,
} from "./state.js";
import { pieceColor } from "./rules.js";
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
const debugMode = window.location.search.includes("debug");
let resignArmed = false;

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
  if (state.outcome?.title) return state.outcome.title;
  if (state.gameOver) return "Game over";
  if (currentMode === "pvp") {
    const gs = state.session.gameState;
    if (gs === "waiting_for_guest") return "PvP setup";
    if (gs === "ready_to_start") return "Ready to start";
    if (gs === "started") return "Game started";
    if (gs === "over") return "Game over";
  }
  return "Free play";
}

function getSubStatus() {
  if (state.outcome?.detail) return state.outcome.detail;
  if (state.gameOver) return "Result locked in";
  if (currentMode === "pvp") {
    if (state.session.gameState === "waiting_for_guest") return "Waiting for opponent to join";
    if (state.session.gameState === "ready_to_start") return "Opponent joined - host can start";
    if (state.session.gameState === "over") return "Game over";
    if (state.session.gameState !== "started") return "PvP setup";
    return currentRole === "host" ? "You play White" : "You play Black";
  }
  return "Move any ready piece";
}

function renderUi(statusText = getStatusText(), subText = getSubStatus()) {
  renderAll(statusText, subText);
  updateResignButton();
}

function pvpStatusLabel() {
  const gs = state.session.gameState;
  if (gs === "waiting_for_guest") return "Waiting for guest...";
  if (gs === "ready_to_start") return "Ready to start";
  if (gs === "started") return "Playing";
  if (gs === "over") {
    if (state.outcome?.detail?.toLowerCase().includes("resigned")) return state.outcome.detail;
    if (state.outcome?.title) {
      if (state.outcome.title.includes("White wins")) return "White won";
      if (state.outcome.title.includes("Black wins")) return "Black won";
      return state.outcome.title;
    }
    return "Game over";
  }
  return "";
}

function setLifecycle(nextState) {
  setGameState(nextState);
  if (nextState !== "started") resetResignPrompt();
  updateInviteUI();
}

function roleToColor(role) {
  if (role === "host") return "w";
  if (role === "guest") return "b";
  return null;
}

function canLocalResign() {
  return currentMode === "pvp" && (currentRole === "host" || currentRole === "guest");
}

function isGameInProgress() {
  const started =
    currentMode === "pvp" ? state.session.gameState === "started" : !state.gameOver;
  return started && !state.gameOver;
}

function resetResignPrompt() {
  resignArmed = false;
  updateResignButton();
}

function updateResignButton() {
  const row = elements.resignRow;
  const btn = elements.resignBtn;
  if (!row || !btn) return;
  const visible = isGameInProgress() && canLocalResign();
  row.classList.toggle("hidden", !visible);
  if (!visible) {
    resignArmed = false;
    return;
  }
  btn.textContent = resignArmed ? "Click again to resign" : "Resign";
  btn.classList.toggle("confirm", resignArmed);
}

function makeResignOutcome(resignerRole) {
  const resigningColor = roleToColor(resignerRole);
  if (!resigningColor) return null;
  const winner = resigningColor === "w" ? "b" : "w";
  const winnerLabel = winner === "w" ? "White wins" : "Black wins";
  const resignerLabel = resigningColor === "w" ? "White" : "Black";
  return { title: winnerLabel, detail: `${resignerLabel} resigned` };
}

function applyOutcomeEverywhere(outcome) {
  if (!outcome) return;
  forceOutcome(outcome, serverState);
  forceOutcome(outcome, state);
  if (state.session.mode === "pvp") {
    setLifecycle("over");
  }
  pendingIntents = [];
  resetResignPrompt();
  renderUi(getStatusText(), getSubStatus());
}

function sendResignMessage() {
  if (!wsConnected || !ws || !currentGameId) return;
  ws.send(
    JSON.stringify({
      type: "resign",
      role: currentRole,
      gameId: currentGameId,
      ts: Date.now(),
    })
  );
}

function handleResignClick() {
  if (!isGameInProgress() || !canLocalResign()) {
    resetResignPrompt();
    return;
  }
  if (!resignArmed) {
    resignArmed = true;
    updateResignButton();
    return;
  }
  const outcome = makeResignOutcome(currentRole);
  applyOutcomeEverywhere(outcome);
  if (outcome && currentMode === "pvp") {
    sendResignMessage();
  }
}

function applyRemoteResign(role) {
  const outcome = makeResignOutcome(role);
  applyOutcomeEverywhere(outcome);
}

function handleRematchClick() {
  if (currentMode !== "pvp") return;
  if (state.session.gameState !== "over") return;
  triggerRematch(true);
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
  if (state.session.mode === "pvp" && state.gameOver) {
    setLifecycle("over");
  }
  renderUi(getStatusText(), getSubStatus());
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

function isPieceAllowedForRole(piece) {
  if (debugMode) return true;
  const color = pieceColor(piece);
  if (!color) return false;
  if (currentRole === "host") return color === "w";
  if (currentRole === "guest") return color === "b";
  return true;
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
  const piece = state.game.board[fromIdx];
  if (!piece || !isPieceAllowedForRole(piece)) return "none";

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
      renderUi(getStatusText(), getSubStatus());
      return;
    }
    if (piece && isPieceAllowedForRole(piece) && canSelect(idx)) {
      selectSquare(idx);
      renderUi(getStatusText(), getSubStatus());
      return;
    }
    renderUi(getStatusText(), getSubStatus());
    return;
  }

  if (state.selected === idx) {
    if (state.premove[idx]) {
      clearPremoveEverywhere(idx);
    }
    clearSelection();
    renderUi(getStatusText(), getSubStatus());
    return;
  }

  const action = handleMoveIntent(idx);
  if (action === "intent") {
    renderUi(getStatusText(), getSubStatus());
    return;
  }
  if (action === "promotion") return;

  if (piece && isPieceAllowedForRole(piece) && canSelect(idx)) {
    selectSquare(idx);
  } else {
    clearSelection();
  }
  renderUi(getStatusText(), getSubStatus());
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
    renderUi(getStatusText(), getSubStatus());
  } else if (action === "none") {
    renderUi(getStatusText(), getSubStatus());
  }
}

function newGame(nextLifecycle) {
  const lifecycle =
    nextLifecycle ||
    (currentMode === "pvp"
      ? state.session.opponentJoined
        ? "ready_to_start"
        : "waiting_for_guest"
      : "started");
  setLifecycle(lifecycle);
  resetGame();
  resetResignPrompt();
  pendingIntents = [];
  intentSeq = 1;
  state.orientation = currentRole === "guest" ? "b" : "w";
  renderUi("Ready", getSubStatus());
}

function triggerRematch(local = true) {
  if (currentMode !== "pvp") return;
  const nextLifecycle = state.session.opponentJoined ? "ready_to_start" : "waiting_for_guest";
  setLifecycle(nextLifecycle);
  resetGame();
  resetResignPrompt();
  pendingIntents = [];
  intentSeq = 1;
  state.orientation = currentRole === "guest" ? "b" : "w";
  renderUi("Ready", getSubStatus());
  if (local && wsConnected && ws) {
    ws.send(JSON.stringify({ type: "rematch", gameId: currentGameId }));
  }
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
      if (data.type === "resign") {
        applyRemoteResign(data.role);
        return;
      }
      if (data.type === "rematch") {
        triggerRematch(false);
        return;
      }
      if (data.type === "state" && data.state) {
        const wasStarted = state.session.gameStarted;
        setOpponentJoined(!!data.state.guest);
        const nextLifecycle =
          data.state.state ||
          (data.state.started
            ? "started"
            : data.state.guest
              ? "ready_to_start"
              : "waiting_for_guest");
        if (state.gameOver) {
          setLifecycle("over");
        } else if (state.session.gameState !== "over") {
          setLifecycle(nextLifecycle);
        }
        if (nextLifecycle === "started" && !wasStarted) startInitialCooldowns();
        updateInviteUI();
        renderUi(getStatusText(), getSubStatus());
      }
      if (data.type === "joined") {
        setOpponentJoined(true);
        if (!state.gameOver && state.session.gameState !== "over" && state.session.gameState !== "started") {
          setLifecycle("ready_to_start");
        } else {
          updateInviteUI();
        }
        renderUi(getStatusText(), getSubStatus());
      }
      if (data.type === "started") {
        const wasStarted = state.session.gameStarted;
        setLifecycle("started");
        if (!wasStarted) startInitialCooldowns();
        updateInviteUI();
        renderUi("Game started", getSubStatus());
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
    elements.rematchBtn.classList.add("hidden");
    elements.pvpStatus.textContent = "";
    return;
  }
  panel.classList.remove("hidden");
  const link = buildInviteLink(currentGameId);
  elements.inviteLink.value = link;
  const isHost = currentRole === "host";
  const gs = state.session.gameState;
  elements.startGameBtn.textContent = "Start game";
  elements.startGameBtn.disabled = !(isHost && gs === "ready_to_start");
  elements.startGameBtn.classList.toggle("hidden", !isHost);
  elements.rematchBtn.classList.toggle("hidden", gs !== "over");
  if (!serverAvailable) {
    elements.startGameBtn.disabled = true;
    elements.rematchBtn.disabled = true;
    elements.pvpStatus.textContent = "PvP server unavailable. Run node server.js";
    return;
  }
  elements.rematchBtn.disabled = false;
  elements.pvpStatus.textContent = pvpStatusLabel();
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
    setLifecycle("waiting_for_guest");
    logDebug("[mode] host pvp", { gameId: currentGameId });
    connectWs(currentGameId, currentRole);
  } else {
    currentRole = "solo";
    setRole("solo");
    setOpponentJoined(false);
    setLifecycle("started");
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
      setLifecycle("ready_to_start");
      logDebug("[url] join as guest", { gameId });
      connectWs(gameId, currentRole);
    } else {
      currentRole = "host";
      setRole("host");
      setOrientation("w");
      setLifecycle("waiting_for_guest");
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
  elements.rematchBtn = document.getElementById("rematchBtn");
  elements.soloOptions = document.getElementById("soloOptions");
  elements.resignBtn = document.getElementById("resignBtn");
  elements.resignRow = document.getElementById("resignRow");
  elements.debugLog = document.getElementById("debugLog");

  bindControls(elements, {
    onSquareClick: handleSquareClick,
    onDrop: handleDrop,
    onNewGame: () => {
      newGame();
    },
    onFlip: () => {
      state.orientation = state.orientation === "w" ? "b" : "w";
      renderUi(getStatusText(), getSubStatus());
    },
    onReset: () => {
      newGame();
    },
    onSideChange: () => {},
    onDifficultyChange: () => {},
    onPromotionChoice: (move) => executeMove(move),
    canDrag: (idx) => {
      const piece = state.game.board[idx];
      return piece && isPieceAllowedForRole(piece) && canSelect(idx);
    },
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
    if (state.session.gameState !== "ready_to_start") return;
    setLifecycle("started");
    startInitialCooldowns();
    updateInviteUI();
    renderUi("Game started", getSubStatus());
    if (wsConnected && ws) {
      ws.send(JSON.stringify({ type: "start", gameId: currentGameId }));
    }
  });

  elements.rematchBtn.addEventListener("click", handleRematchClick);
  elements.resignBtn.addEventListener("click", handleResignClick);
  document.addEventListener("click", (event) => {
    if (!resignArmed) return;
    if (elements.resignBtn && elements.resignBtn.contains(event.target)) return;
    resetResignPrompt();
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
