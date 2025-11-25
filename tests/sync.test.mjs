import assert from "node:assert/strict";
import {
  serverState,
  state as clientState,
  resetGame,
  applyIntent,
  processPremoves,
  snapshotCore,
  hydrateClientFromCore,
} from "../state.js";
import { generateLegalMoves, squareToIdx, pieceColor } from "../rules.js";

function fresh() {
  resetGame();
  serverState.cooldowns = Array(64).fill(null);
  serverState.premove = Array(64).fill(null);
  const snap = snapshotCore(serverState);
  hydrateClientFromCore(snap);
  return {
    server: serverState,
    client: clientState,
  };
}

function makeIntent({ clientId = "c1", seq = 1, from, to, promotion = null, createdAt = Date.now() }) {
  return { id: `${clientId}-${seq}`, clientId, seq, from, to, promotion, createdAt };
}

function reconcileFromServer() {
  const snap = snapshotCore(serverState);
  hydrateClientFromCore(snap);
}

function applyAndReconcile(intent) {
  const pred = applyIntent(intent, clientState, intent.createdAt);
  if (pred.accepted) {
    applyIntent(intent, serverState, intent.createdAt);
    processPremoves(serverState, intent.createdAt);
    reconcileFromServer();
  }
  return pred;
}

function boardDiff(a, b) {
  const diff = [];
  for (let i = 0; i < 64; i++) {
    if (a.game.board[i] !== b.game.board[i]) diff.push(i);
  }
  return diff;
}

function testSimpleSync() {
  const { server, client } = fresh();
  const e2 = squareToIdx("e2");
  const e4 = squareToIdx("e4");
  const intent = makeIntent({ from: e2, to: e4, seq: 1, createdAt: Date.now() });
  const res = applyAndReconcile(intent);
  assert(res.accepted && res.executed, "First move should execute");
  assert.deepEqual(boardDiff(server, client), [], "Client and server boards should match");
}

function testConflictRejection() {
  const { server } = fresh();
  const e2 = squareToIdx("e2");
  const e4 = squareToIdx("e4");
  const e3 = squareToIdx("e3");
  const t0 = Date.now();
  // First intent moves pawn to e4
  applyIntent(makeIntent({ clientId: "c1", seq: 1, from: e2, to: e4, createdAt: t0 }), server, t0);
  // Second intent from another client tries to move same pawn now at e2 to e3 (should be rejected)
  const res = applyIntent(
    makeIntent({ clientId: "c2", seq: 1, from: e2, to: e3, createdAt: t0 + 1 }),
    server,
    t0 + 1
  );
  assert(!res.executed, "Conflicting move should not execute");
}

function testSimultaneousCompatible() {
  fresh();
  const e2 = squareToIdx("e2");
  const d7 = squareToIdx("d7");
  const e4 = squareToIdx("e4");
  const d5 = squareToIdx("d5");
  const t0 = Date.now();
  const intents = [
    makeIntent({ clientId: "host", seq: 1, from: e2, to: e4, createdAt: t0 }),
    makeIntent({ clientId: "guest", seq: 1, from: d7, to: d5, createdAt: t0 + 1 }),
  ];
  intents.forEach((i) => applyIntent(i, serverState, i.createdAt));
  reconcileFromServer();
  const diff = boardDiff(serverState, clientState);
  assert.deepEqual(diff, [], "Boards stay in sync after compatible simultaneous moves");
}

function testPremoveExecutesWhenReady() {
  fresh();
  const wKnight = squareToIdx("g1");
  const f3 = squareToIdx("f3");
  const t0 = Date.now();
  // Move knight to f3 and put it on cooldown
  applyIntent(makeIntent({ from: wKnight, to: f3, createdAt: t0 }), serverState, t0);
  serverState.cooldowns[f3] = { until: t0 + 10000, duration: 10000 };
  const snap = snapshotCore(serverState);
  hydrateClientFromCore(snap);
  // Premove back to g1 while on cooldown
  const back = makeIntent({ from: f3, to: wKnight, createdAt: t0 + 10 });
  const pred = applyIntent(back, clientState, back.createdAt);
  assert(pred.premoved || !pred.executed, "Premove should queue while on cooldown");
  applyIntent(back, serverState, back.createdAt);
  // Advance time past cooldown
  processPremoves(serverState, t0 + 10001);
  reconcileFromServer();
  assert.equal(serverState.game.board[wKnight], "N", "Premove executes when ready");
  assert.deepEqual(boardDiff(serverState, clientState), [], "Client and server remain synced");
}

function testTimingOrderQueue() {
  fresh();
  const e2 = squareToIdx("e2");
  const e4 = squareToIdx("e4");
  const e3 = squareToIdx("e3");
  const t0 = Date.now();
  const i1 = makeIntent({ from: e2, to: e3, createdAt: t0, seq: 1 });
  const i2 = makeIntent({ from: e2, to: e4, createdAt: t0 + 1, seq: 2 });
  applyIntent(i1, serverState, i1.createdAt);
  applyIntent(i2, serverState, i2.createdAt);
  reconcileFromServer();
  // Only first should execute; second should be rejected as incompatible
  assert.equal(serverState.game.board[e3], "P", "First move applied to e3");
  assert.equal(serverState.game.board[e2], null, "Origin square now empty");
}

testSimpleSync();
testConflictRejection();
testSimultaneousCompatible();
testPremoveExecutesWhenReady();
testTimingOrderQueue();

console.log("sync tests passed");
