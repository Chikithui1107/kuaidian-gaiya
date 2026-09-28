import assert from "node:assert/strict";
import { Game } from "../js/sim.js";

const game = new Game();
game.resetRun({ hero: "striker", weapon: "mg", gems: [] });
assert.equal(game.phase, "plan");
assert.equal(game.place("cannon", 4, 0, false).reason, "出了十字战场");
assert.equal(game.place("wall", 7, 7, false).reason, "不能盖在核心上");
assert.equal(game.place("gun", 5, 0, false).ok, true);
assert.equal(game.gold, 68);

const started = game.beginWave();
assert.equal(started.interest, 7);
assert.equal(game.gold, 75);
assert.equal(game.wave, 1);
assert.equal(game.phase, "combat");

for (let i = 0; i < 900; i++) game.update(0.05);
assert.ok(Number.isFinite(game.gold));
assert.ok(Number.isFinite(game.coreHp));
assert.ok(game.phase === "draft" || game.phase === "lose" || game.phase === "win");

const siege = new Game();
siege.resetRun({ hero: "striker", weapon: "sniper", gems: [] });
for (let x = 5; x <= 9; x++) {
  assert.equal(siege.place("wall", x, 1, false).ok, true, `wall ${x}`);
}
const wallHp = siege.buildings.map((building) => building.hp);
siege.mods.heroDmg = 0;
siege.beginWave();
for (let i = 0; i < 200; i++) siege.update(0.05);
const damaged = siege.buildings.some((building, index) => building.hp < wallHp[index]);
const coreHit = siege.coreHp < siege.coreMax;
assert.ok(damaged || coreHit);

const hoard = new Game();
hoard.resetRun({ hero: "engineer", weapon: "coil", gems: [] });
hoard.gold = 1000;
assert.equal(hoard.interestPreview(), 40);
hoard.gold = 25;
assert.equal(hoard.interestPreview(), 3);

console.log("sim tests ok");
