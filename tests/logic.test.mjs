import assert from "node:assert/strict";
import { BUILDINGS } from "../js/config.js";
import {
  calcInterest,
  canPlace,
  chooseTarget,
  coreCells,
  isCoreCell,
  isPlayable,
  sellRefund,
  waveSides,
} from "../js/logic.js";

function emptyBlocked() {
  return () => false;
}

const cases = [
  [0, 0],
  [4, 0],
  [5, 0],
  [14, 0],
  [0, 7],
  [4, 4],
  [5, 4],
  [4, 5],
  [7, 7],
  [10, 10],
  [9, 14],
];

for (const [x, y] of cases) {
  const onArm = (x >= 5 && x <= 9) || (y >= 5 && y <= 9);
  assert.equal(isPlayable(x, y), onArm, `playable ${x},${y}`);
}

assert.equal(isCoreCell(6, 6), true);
assert.equal(isCoreCell(5, 7), false);
assert.equal(coreCells().length, 9);

assert.equal(calcInterest(0, 10, 40), 0);
assert.equal(calcInterest(4, 10, 40), 0);
assert.equal(calcInterest(5, 10, 40), 1);
assert.equal(calcInterest(14, 10, 40), 1);
assert.equal(calcInterest(15, 10, 40), 2);
assert.equal(calcInterest(25, 10, 40), 3);
assert.equal(calcInterest(400, 10, 40), 40);
assert.equal(calcInterest(1000, 10, 40), 40);
assert.equal(calcInterest(10, 15, 40), 2);
assert.equal(sellRefund(42), 21);
assert.equal(sellRefund(41), 21);

assert.equal(canPlace(0, 0, 1, 1, emptyBlocked()), "出了十字战场");
assert.equal(canPlace(7, 7, 1, 1, emptyBlocked()), "不能盖在核心上");
assert.equal(canPlace(5, 0, 3, 3, emptyBlocked()), null);
assert.equal(canPlace(4, 0, 3, 3, emptyBlocked()), "出了十字战场");
assert.equal(canPlace(7, 0, 1, 1, (x, y) => x === 7 && y === 0), "这里已经有建筑");

const sides = waveSides(8);
assert.deepEqual(sides.filter((side) => side === "n").length, 2);
assert.equal(new Set(sides).size, 4);

function walkableFrom(blocked) {
  return (x, y) => isPlayable(x, y) && !isCoreCell(x, y) && !blocked.has(`${x},${y}`);
}

function wall(id, cells) {
  return { id, kind: "wall", cells };
}
function tower(id, cells) {
  return { id, kind: "tower", cells };
}

// 北臂只有一截墙，旁边能绕，敌人应该去打核心而不是拆墙。
{
  const blocked = new Set(["5,2"]);
  const choice = chooseTarget({
    sx: 5,
    sy: 0,
    towerBias: 4,
    buildings: [wall(1, [[5, 2]])],
    walkable: walkableFrom(blocked),
  });
  assert.equal(choice.type, "core");
}

// 北臂整排封死，敌人只能拆墙，而且会挑更靠近核心的那一截。
{
  const cells = [
    [5, 1],
    [6, 1],
    [7, 1],
    [8, 1],
    [9, 1],
  ];
  const blocked = new Set(cells.map(([x, y]) => `${x},${y}`));
  const buildings = cells.map((cell, index) => wall(index + 1, [cell]));
  const choice = chooseTarget({
    sx: 7,
    sy: 0,
    towerBias: 4,
    buildings,
    walkable: walkableFrom(blocked),
  });
  assert.equal(choice.type, "building");
  assert.equal(choice.id, 3);
}

// 炮塔贴在脸上，比核心近一截以上，普通敌人会转去打炮塔。
{
  const choice = chooseTarget({
    sx: 7,
    sy: 0,
    towerBias: 4,
    buildings: [tower(9, [[7, 1], [8, 1], [7, 2], [8, 2]])],
    walkable: walkableFrom(new Set(["7,1", "8,1", "7,2", "8,2"])),
  });
  assert.equal(choice.type, "building");
  assert.equal(choice.id, 9);
}

// 同一座炮塔对突进敌人不够近，突进仍冲核心。
{
  const choice = chooseTarget({
    sx: 7,
    sy: 0,
    towerBias: 7,
    buildings: [tower(9, [[7, 1], [8, 1], [7, 2], [8, 2]])],
    walkable: walkableFrom(new Set(["7,1", "8,1", "7,2", "8,2"])),
  });
  assert.equal(choice.type, "core");
}

// 炮塔退到路边，普通敌人绕去核心，不中途改打炮塔。
{
  const cells = [
    [5, 4],
    [6, 4],
    [5, 5],
    [6, 5],
  ];
  const choice = chooseTarget({
    sx: 9,
    sy: 0,
    towerBias: 4,
    buildings: [tower(4, cells)],
    walkable: walkableFrom(new Set(cells.map(([x, y]) => `${x},${y}`))),
  });
  assert.equal(choice.type, "core");
  assert.ok(choice.path.length > 0);
}

assert.equal(BUILDINGS.cannon.w * BUILDINGS.cannon.h, 9);
assert.equal(BUILDINGS.gun.w * BUILDINGS.gun.h, 4);

console.log("logic tests ok");
