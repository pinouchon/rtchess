import assert from "node:assert/strict";
import { initialState, generatePatternMoves, squareToIdx } from "../rules.js";

function testPawnPremovePatterns() {
  const game = initialState();
  const a2 = squareToIdx("a2");
  const pattern = generatePatternMoves(game, a2);
  const destinations = pattern.map((p) => [p.to, p.type]);

  const a3 = squareToIdx("a3");
  const a4 = squareToIdx("a4");
  const b3 = squareToIdx("b3");

  assert(
    destinations.find(([to, type]) => to === a3 && type === "move"),
    "a2 pawn should have a one-step forward pattern"
  );
  assert(
    destinations.find(([to, type]) => to === a4 && type === "move"),
    "a2 pawn should have a two-step forward pattern from start rank"
  );
  assert(
    destinations.find(([to, type]) => to === b3 && type === "capture"),
    "a2 pawn should have a diagonal capture pattern to b3"
  );

  assert.equal(
    destinations.length,
    3,
    "a2 pawn should only expose three pattern moves at the start"
  );
}

testPawnPremovePatterns();

console.log("premove tests passed");
