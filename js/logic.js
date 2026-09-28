import {
  ARM,
  ARM_END,
  ARM_START,
  COLS,
  CORE_ORIGIN,
  CORE_SIZE,
  ROWS,
} from "./config.js";

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < COLS && y < ROWS;
}

/** 十字：落在中间横条或中间竖条里。四角是背景。 */
export function isPlayable(x, y) {
  if (!inBounds(x, y)) return false;
  return (x >= ARM_START && x <= ARM_END) || (y >= ARM_START && y <= ARM_END);
}

export function isCoreCell(x, y) {
  return (
    x >= CORE_ORIGIN &&
    x < CORE_ORIGIN + CORE_SIZE &&
    y >= CORE_ORIGIN &&
    y < CORE_ORIGIN + CORE_SIZE
  );
}

export function coreCells() {
  const cells = [];
  for (let y = CORE_ORIGIN; y < CORE_ORIGIN + CORE_SIZE; y++) {
    for (let x = CORE_ORIGIN; x < CORE_ORIGIN + CORE_SIZE; x++) cells.push([x, y]);
  }
  return cells;
}

export function neighbors4(x, y) {
  return [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
  ];
}

export function cellsFor(x, y, w, h) {
  const cells = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) cells.push([x + i, y + j]);
  }
  return cells;
}

export function orientedSize(def, rotated) {
  if (rotated && def.w !== def.h) return { w: def.h, h: def.w };
  return { w: def.w, h: def.h };
}

/**
 * 利息：gold × 百分比，四舍五入，再吃上限。
 * 用「金币 × 百分比 / 100」避免 0.1 二进制误差把 2.5 算成 2.4999。
 */
export function calcInterest(gold, percent, cap) {
  const interest = Math.round((gold * percent) / 100);
  return Math.min(cap, Math.max(0, interest));
}

export function sellRefund(invested) {
  return Math.round(invested * 0.5);
}

export function canPlace(x, y, w, h, blocked) {
  for (const [cx, cy] of cellsFor(x, y, w, h)) {
    if (!isPlayable(cx, cy)) return "出了十字战场";
    if (isCoreCell(cx, cy)) return "不能盖在核心上";
    if (blocked(cx, cy)) return "这里已经有建筑";
  }
  return null;
}

export function manhattan(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

export function isAdjacentToCells(x, y, cells) {
  return cells.some(([cx, cy]) => manhattan(x, y, cx, cy) === 1);
}

/** 站在建筑上，或贴着它，都算已经咬住。 */
export function isTouching(x, y, cells) {
  return cells.some(([cx, cy]) => manhattan(x, y, cx, cy) <= 1);
}

export function bfs(sx, sy, walkable) {
  const dist = Array.from({ length: ROWS }, () => Array(COLS).fill(Infinity));
  const prev = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  if (!walkable(sx, sy)) return { dist, prev };
  const queue = [[sx, sy]];
  dist[sy][sx] = 0;
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    for (const [nx, ny] of neighbors4(x, y)) {
      if (!walkable(nx, ny) || dist[ny][nx] <= dist[y][x] + 1) continue;
      dist[ny][nx] = dist[y][x] + 1;
      prev[ny][nx] = [x, y];
      queue.push([nx, ny]);
    }
  }
  return { dist, prev };
}

function approachDist(cells, dist) {
  let best = Infinity;
  for (const [x, y] of cells) {
    for (const [nx, ny] of neighbors4(x, y)) {
      if (!inBounds(nx, ny)) continue;
      if (dist[ny][nx] < best) best = dist[ny][nx];
    }
  }
  return best;
}

function nearestCoreGap(cells) {
  let best = Infinity;
  const cx = CORE_ORIGIN + 1;
  const cy = CORE_ORIGIN + 1;
  for (const [x, y] of cells) best = Math.min(best, manhattan(x, y, cx, cy));
  return best;
}

function pathToCell(prev, sx, sy, gx, gy) {
  const path = [];
  let x = gx;
  let y = gy;
  while (!(x === sx && y === sy)) {
    path.push([x, y]);
    const p = prev[y][x];
    if (!p) return null;
    [x, y] = p;
  }
  path.reverse();
  return path;
}

function pathToAdjacent(dist, prev, sx, sy, cells) {
  let best = null;
  for (const [x, y] of cells) {
    for (const [nx, ny] of neighbors4(x, y)) {
      if (!inBounds(nx, ny) || dist[ny][nx] === Infinity) continue;
      if (!best || dist[ny][nx] < best.d) best = { x: nx, y: ny, d: dist[ny][nx] };
    }
  }
  if (!best) return null;
  if (best.x === sx && best.y === sy) return [];
  return pathToCell(prev, sx, sy, best.x, best.y);
}

/**
 * 选目标：
 * - 能走到核心时，核心是默认目标。炮塔要明显更近才会把敌人吸走。
 * - 墙不会主动吸引火力；只有路被堵死，敌人才会拆路上的建筑。
 * - 堵死时，打能碰到的、最靠近核心的那一截。
 */
export function chooseTarget({ sx, sy, towerBias, buildings, walkable }) {
  const cores = coreCells();
  if (!walkable(sx, sy)) {
    return { type: "stuck", path: [] };
  }
  const { dist, prev } = bfs(sx, sy, walkable);
  const coreDist = approachDist(cores, dist);

  let bestTower = null;
  for (const building of buildings) {
    if (building.kind === "wall") continue;
    const d = approachDist(building.cells, dist);
    if (d === Infinity) continue;
    const score = d + towerBias;
    if (!bestTower || score < bestTower.score) bestTower = { building, d, score };
  }

  if (coreDist !== Infinity) {
    const coreScore = coreDist;
    if (bestTower && bestTower.score < coreScore) {
      const path = pathToAdjacent(dist, prev, sx, sy, bestTower.building.cells);
      return { type: "building", id: bestTower.building.id, path: path ?? [] };
    }
    const path = pathToAdjacent(dist, prev, sx, sy, cores);
    return { type: "core", path: path ?? [] };
  }

  let blocker = null;
  for (const building of buildings) {
    const d = approachDist(building.cells, dist);
    if (d === Infinity) continue;
    const goal = nearestCoreGap(building.cells);
    if (
      !blocker ||
      goal < blocker.goal ||
      (goal === blocker.goal && d < blocker.d)
    ) {
      blocker = { building, d, goal };
    }
  }
  if (!blocker) return { type: "stuck", path: [] };
  const path = pathToAdjacent(dist, prev, sx, sy, blocker.building.cells);
  return { type: "building", id: blocker.building.id, path: path ?? [] };
}

export function spawnCell(side, slot) {
  const lane = ARM_START + (slot % ARM);
  if (side === "n") return [lane, 0];
  if (side === "s") return [lane, ROWS - 1];
  if (side === "w") return [0, lane];
  return [COLS - 1, lane];
}

export function waveSides(count) {
  const sides = ["n", "e", "s", "w"];
  const plan = [];
  for (let i = 0; i < count; i++) plan.push(sides[i % 4]);
  return plan;
}

export function computeBonds(gems) {
  const count = { fire: 0, ice: 0, lightning: 0, poison: 0 };
  for (const gem of gems) {
    if (gem) count[gem.element] += 1;
  }
  return count;
}

export function seriesProgress(typesPresent, need) {
  const have = need.filter((type) => typesPresent.has(type));
  return { have: have.length, need: need.length, ready: have.length === need.length };
}
