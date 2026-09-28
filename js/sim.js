import {
  BUILDINGS,
  CORE_HP,
  ENEMY_TYPES,
  HEROES,
  INTEREST_CAP,
  INTEREST_PERCENT,
  MAX_BUILDING_LEVEL,
  SERIES,
  START_GOLD,
  TOWER_BIAS,
  UPGRADES,
  WAVES,
  WEAPONS,
} from "./config.js";
import {
  calcInterest,
  canPlace,
  cellsFor,
  chooseTarget,
  computeBonds,
  coreCells,
  inBounds,
  isPlayable,
  isTouching,
  orientedSize,
  sellRefund,
  seriesProgress,
  spawnCell,
  waveSides,
} from "./logic.js";

const HERO_ENERGY_MAX = 100;

function emptyMods() {
  return {
    towerAspd: 1,
    towerDmg: 1,
    heroDmg: 1,
    slowPower: 1,
    repairMul: 1,
    wallHp: 1,
    blast: 0,
    goldFind: 1,
    interestPercent: INTEREST_PERCENT,
    interestCap: INTEREST_CAP,
  };
}

export class Game {
  constructor() {
    this.timeScale = 1;
    this.onChange = null;
    this.resetRun({ hero: "striker", weapon: "mg", gems: [] });
    this.phase = "menu";
  }

  resetRun(loadout) {
    this.heroId = loadout.hero;
    this.weaponId = loadout.weapon;
    this.gems = (loadout.gems ?? []).filter(Boolean);
    this.bonds = computeBonds(this.gems);
    this.mods = emptyMods();
    this.applyGemStats();
    this.phase = "plan";
    this.wave = 0;
    this.gold = START_GOLD;
    this.coreHp = CORE_HP;
    this.coreMax = CORE_HP;
    this.buildings = [];
    this.enemies = [];
    this.fx = [];
    this.texts = [];
    this.toasts = [];
    this.shake = 0;
    this.clock = 0;
    this.nextId = 1;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.heroCd = 0.4;
    this.energy = 0;
    this.upgradesLeft = UPGRADES.map((item) => item.id);
    this.draft = [];
    this.tipIndex = 0;
    this.interestEarned = 0;
    this.goldEarned = 0;
    this.kills = 0;
    this.placed = 0;
    this.coreFlash = 0;
    this._procDepth = 0;
    this.banner = "";
    this.bannerT = 0;
    this.ended = false;
    this.settled = false;
    this.occupancy = this.makeOccupancy();
  }

  applyGemStats() {
    for (const gem of this.gems) {
      if (gem.stat === "towerDmg") this.mods.towerDmg += gem.value;
      if (gem.stat === "heroDmg") this.mods.heroDmg += gem.value;
      if (gem.stat === "wallHp") this.mods.wallHp += gem.value;
      if (gem.stat === "goldFind") this.mods.goldFind += gem.value;
      if (gem.stat === "repair") this.mods.repairMul *= 1 - gem.value;
    }
  }

  uid() {
    this.nextId += 1;
    return this.nextId;
  }

  makeOccupancy() {
    const grid = Array.from({ length: 15 }, () => Array(15).fill(null));
    for (const [x, y] of coreCells()) grid[y][x] = "core";
    for (const building of this.buildings) {
      for (const [x, y] of building.cells) grid[y][x] = building.id;
    }
    return grid;
  }

  refreshOcc() {
    this.occupancy = this.makeOccupancy();
  }

  walkable = (x, y) => {
    if (!isPlayable(x, y)) return false;
    return !this.occupancy[y][x];
  };

  buildingById(id) {
    return this.buildings.find((building) => building.id === id) ?? null;
  }

  footprint(type, rotated) {
    return orientedSize(BUILDINGS[type], rotated);
  }

  place(type, x, y, rotated) {
    if (this.phase !== "plan" && this.phase !== "combat") {
      return { ok: false, reason: "现在不能盖" };
    }
    const def = BUILDINGS[type];
    if (!def) return { ok: false, reason: "没有这种建筑" };
    const { w, h } = orientedSize(def, rotated);
    const reason = canPlace(x, y, w, h, (cx, cy) => Boolean(this.occupancy[cy][cx]));
    if (reason) return { ok: false, reason };
    if (this.gold < def.cost) return { ok: false, reason: "金币不够" };
    this.gold -= def.cost;
    const building = {
      id: this.uid(),
      type,
      kind: type === "wall" ? "wall" : "tower",
      x,
      y,
      w,
      h,
      cells: cellsFor(x, y, w, h),
      level: 1,
      invested: def.cost,
      hp: 0,
      flash: 0,
      cd: 0.2,
    };
    const max = this.maxHp(building);
    building.hp = max;
    this.buildings.push(building);
    this.placed += 1;
    this.refreshOcc();
    this.retargetAll();
    return { ok: true, id: building.id };
  }

  maxHp(building) {
    const def = BUILDINGS[building.type];
    const levelMul = 1 + (building.level - 1) * 0.4;
    const wallMul = building.kind === "wall" ? this.mods.wallHp : 1;
    return Math.round(def.hp * levelMul * wallMul);
  }

  damageOf(building) {
    const def = BUILDINGS[building.type];
    const levelMul = 1 + (building.level - 1) * 0.35;
    let series = 1;
    if (def.series === "firepower" && this.synergy().firepower.ready) series = 1.2;
    return def.dmg * levelMul * this.mods.towerDmg * series;
  }

  rateOf(building) {
    const def = BUILDINGS[building.type];
    const levelMul = 1 - (building.level - 1) * 0.08;
    return def.rate * levelMul / this.mods.towerAspd;
  }

  upgradeCost(building) {
    const def = BUILDINGS[building.type];
    return Math.round(def.cost * 0.7 * building.level);
  }

  upgrade(id) {
    if (this.phase !== "plan" && this.phase !== "combat") return { ok: false, reason: "现在不能动" };
    const building = this.buildingById(id);
    if (!building) return { ok: false, reason: "建筑不在了" };
    if (building.level >= MAX_BUILDING_LEVEL) return { ok: false, reason: "已经满级" };
    const cost = this.upgradeCost(building);
    if (this.gold < cost) return { ok: false, reason: "金币不够" };
    this.gold -= cost;
    building.invested += cost;
    building.level += 1;
    building.hp = this.maxHp(building);
    return { ok: true };
  }

  repairCost(building) {
    const missing = this.maxHp(building) - building.hp;
    if (missing <= 0.5) return 0;
    return Math.max(1, Math.round(missing * 0.1 * this.mods.repairMul));
  }

  repair(id) {
    if (this.phase !== "plan" && this.phase !== "combat") return { ok: false, reason: "现在不能动" };
    const building = this.buildingById(id);
    if (!building) return { ok: false, reason: "建筑不在了" };
    const cost = this.repairCost(building);
    if (cost <= 0) return { ok: false, reason: "不需要修" };
    if (this.gold < cost) return { ok: false, reason: "金币不够" };
    this.gold -= cost;
    building.hp = this.maxHp(building);
    this.floater(building.x + building.w / 2, building.y + building.h / 2, "修好", "#9ad7a4");
    return { ok: true };
  }

  sell(id) {
    const building = this.buildingById(id);
    if (!building) return { ok: false, reason: "建筑不在了" };
    if (this.phase !== "plan" && this.phase !== "combat") return { ok: false, reason: "现在不能拆" };
    const refund = sellRefund(building.invested);
    this.gold += refund;
    this.buildings = this.buildings.filter((item) => item.id !== id);
    this.refreshOcc();
    this.retargetAll();
    this.floater(building.x + building.w / 2, building.y, `+${refund}`, "#f0c14d");
    return { ok: true, refund };
  }

  interestPreview() {
    return calcInterest(this.gold, this.mods.interestPercent, this.mods.interestCap);
  }

  beginWave() {
    if (this.phase !== "plan") return { ok: false, reason: "现在不能开战" };
    const interest = this.interestPreview();
    this.gold += interest;
    this.interestEarned += interest;
    if (interest > 0) this.toast(`利息 +${interest}`);
    this.wave += 1;
    const spec = WAVES[this.wave - 1];
    const sides = waveSides(spec.count);
    this.spawnQueue = sides.map((side, index) => ({
      side,
      slot: index,
      kind: spec.mix[index % spec.mix.length],
    }));
    this.spawnTimer = 0.35;
    this.phase = "combat";
    this.banner = `第 ${this.wave} 波`;
    this.bannerT = 1.6;
    return { ok: true, interest };
  }

  update(dt) {
    dt = Math.min(0.05, dt) * this.timeScale;
    this.clock += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 18);
    if (this.coreFlash > 0) this.coreFlash -= dt;
    if (this.bannerT > 0) this.bannerT -= dt;
    for (const item of this.toasts) item.life -= dt;
    this.toasts = this.toasts.filter((item) => item.life > 0);
    for (const text of this.texts) text.age += dt;
    this.texts = this.texts.filter((text) => text.age < text.life);
    for (const bolt of this.fx) bolt.age += dt;
    this.fx = this.fx.filter((bolt) => bolt.age < bolt.life);

    if (this.phase !== "combat") return;

    this.spawnTimer -= dt;
    if (this.spawnQueue.length && this.spawnTimer <= 0) {
      const job = this.spawnQueue.shift();
      this.spawnEnemy(job);
      const spec = WAVES[this.wave - 1];
      this.spawnTimer = spec.interval;
    }

    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateHero(dt);

    if (this.coreHp <= 0) {
      this.coreHp = 0;
      this.finish("lose");
      return;
    }
    if (!this.spawnQueue.length && !this.enemies.length) this.onWaveCleared();
  }

  spawnEnemy(job) {
    const spec = WAVES[this.wave - 1];
    const type = ENEMY_TYPES[job.kind];
    let [x, y] = spawnCell(job.side, Math.floor(job.slot / 4));
    if (!this.walkable(x, y)) {
      const fallback = this.findSpawn(job.side);
      if (fallback) [x, y] = fallback;
    }
    const enemy = {
      id: this.uid(),
      kind: job.kind,
      cx: x,
      cy: y,
      progress: 0,
      move: null,
      hp: Math.round(spec.hp * type.hp),
      maxHp: Math.round(spec.hp * type.hp),
      speed: spec.speed * type.speed,
      dmg: spec.dmg * type.dmg,
      gold: Math.max(1, Math.round(spec.gold * type.gold)),
      bias: TOWER_BIAS[job.kind],
      attackCd: 0.4,
      retarget: 0,
      target: null,
      path: [],
      slow: 1,
      slowT: 0,
      freezeT: 0,
      burnT: 0,
      burnDps: 0,
      poisonT: 0,
      poisonDps: 0,
      flash: 0,
    };
    this.enemies.push(enemy);
    this.assignTarget(enemy);
  }

  findSpawn(side) {
    for (let slot = 0; slot < 5; slot++) {
      const [x, y] = spawnCell(side, slot);
      if (this.walkable(x, y)) return [x, y];
    }
    return null;
  }

  targetCells(target) {
    if (!target) return [];
    if (target.type === "core") return coreCells();
    const building = this.buildingById(target.id);
    return building ? building.cells : [];
  }

  assignTarget(enemy) {
    const buildings = this.buildings.map((building) => ({
      id: building.id,
      kind: building.kind,
      cells: building.cells,
    }));
    if (!this.walkable(enemy.cx, enemy.cy)) {
      const occ = this.occupancy[enemy.cy][enemy.cx];
      if (occ === "core") enemy.target = { type: "core" };
      else if (occ) enemy.target = { type: "building", id: occ };
      enemy.path = [];
      enemy.move = null;
      return;
    }
    const choice = chooseTarget({
      sx: enemy.cx,
      sy: enemy.cy,
      towerBias: enemy.bias,
      buildings,
      walkable: this.walkable,
    });
    enemy.target = choice.type === "building" ? { type: "building", id: choice.id } : { type: choice.type };
    enemy.path = choice.path ?? [];
    enemy.move = null;
  }

  commitPos(enemy) {
    if (!enemy.move) return;
    if (enemy.progress >= 0.5 && this.walkable(enemy.move.nx, enemy.move.ny)) {
      enemy.cx = enemy.move.nx;
      enemy.cy = enemy.move.ny;
    }
    enemy.move = null;
    enemy.progress = 0;
  }

  retargetAll() {
    for (const enemy of this.enemies) {
      this.commitPos(enemy);
      enemy.retarget = 0.35;
      this.assignTarget(enemy);
    }
  }

  updateEnemies(dt) {
    for (const enemy of [...this.enemies]) {
      if (enemy.hp <= 0) continue;
      if (enemy.flash > 0) enemy.flash -= dt;
      if (enemy.freezeT > 0) {
        enemy.freezeT -= dt;
        this.tickDots(enemy, dt);
        continue;
      }
      this.tickDots(enemy, dt);
      if (enemy.hp <= 0) continue;

      enemy.retarget -= dt;
      const targetGone = enemy.target?.type === "building" && !this.buildingById(enemy.target.id);
      if (!enemy.move && (targetGone || enemy.retarget <= 0)) {
        this.assignTarget(enemy);
        enemy.retarget = 0.45;
      }

      const liveCells = this.targetCells(enemy.target);
      if (!enemy.move && isTouching(enemy.cx, enemy.cy, liveCells)) {
        this.enemyAttack(enemy, dt);
        continue;
      }
      if (!enemy.move && enemy.path.length) {
        const [nx, ny] = enemy.path[0];
        if (!this.walkable(nx, ny)) {
          this.assignTarget(enemy);
        } else {
          enemy.move = { x: enemy.cx, y: enemy.cy, nx, ny };
          enemy.progress = 0;
          enemy.path.shift();
        }
      }
      if (enemy.move) {
        const speed = enemy.speed * (enemy.slowT > 0 ? enemy.slow : 1);
        enemy.progress += (speed * dt) / 1;
        if (enemy.progress >= 1) {
          enemy.cx = enemy.move.nx;
          enemy.cy = enemy.move.ny;
          enemy.move = null;
          enemy.progress = 0;
        }
      } else if (!isTouching(enemy.cx, enemy.cy, liveCells)) {
        enemy.retarget = 0;
      }
    }
    this.enemies = this.enemies.filter((enemy) => enemy.hp > 0);
  }

  tickDots(enemy, dt) {
    if (enemy.slowT > 0) {
      enemy.slowT -= dt;
      if (enemy.slowT <= 0) enemy.slow = 1;
    }
    if (enemy.burnT > 0) {
      enemy.burnT -= dt;
      this.hurtEnemy(enemy, enemy.burnDps * dt, null, "#e4572e", false);
    }
    if (enemy.poisonT > 0) {
      enemy.poisonT -= dt;
      this.hurtEnemy(enemy, enemy.poisonDps * dt, null, "#8fbf6a", false);
    }
  }

  enemyAttack(enemy, dt) {
    enemy.attackCd -= dt;
    if (enemy.attackCd > 0) return;
    enemy.attackCd = 0.85;
    if (enemy.target?.type === "core") {
      this.coreHp -= enemy.dmg;
      this.coreFlash = 0.25;
      this.shake = 5;
      this.floater(7, 6.2, `-${Math.round(enemy.dmg)}`, "#ff8d8d");
      return;
    }
    const building = this.buildingById(enemy.target?.id);
    if (!building) return;
    building.hp -= enemy.dmg;
    building.flash = 0.12;
    if (building.hp <= 0) this.destroyBuilding(building);
  }

  destroyBuilding(building) {
    this.floater(building.x + building.w / 2, building.y, "倒塌", "#e7e1d6");
    this.buildings = this.buildings.filter((item) => item.id !== building.id);
    this.refreshOcc();
    this.retargetAll();
  }

  updateTowers(dt) {
    for (const building of this.buildings) {
      if (building.flash > 0) building.flash -= dt;
      if (building.kind === "wall") continue;
      building.cd -= dt;
      if (building.cd > 0) continue;
      const origin = this.centerOf(building);
      const range = BUILDINGS[building.type].range;
      const hits = this.enemies
        .map((enemy) => ({ enemy, d: this.dist(origin, this.pos(enemy)) }))
        .filter((item) => item.enemy.hp > 0 && item.d <= range)
        .sort((a, b) => a.d - b.d);
      if (!hits.length) continue;
      this.fireTower(building, hits);
      building.cd = this.rateOf(building);
    }
  }

  fireTower(building, hits) {
    const def = BUILDINGS[building.type];
    const dmg = this.damageOf(building);
    const origin = this.centerOf(building);
    const primary = hits[0].enemy;
    if (def.splash) {
      this.splash(primary, dmg, def.splash, def.splashMul, origin, building.color ?? def.color);
    } else if (def.chains) {
      const extra = this.synergy().control.ready ? def.chains + 1 : def.chains;
      this.chain(primary, dmg, extra, def.chainFalloff, origin, def.color);
    } else {
      this.hurtEnemy(primary, dmg, origin, def.color);
    }
    if (def.slow) {
      const power = Math.max(0.25, def.slow / this.mods.slowPower);
      const time = def.slowTime * (this.mods.slowPower > 1 ? 1.25 : 1);
      this.applySlow(primary, power, time);
    }
    if (Math.random() < this.mods.blast) {
      this.splash(primary, dmg * 0.45, 0.95, 1, origin, "#f0c14d", false);
    }
  }

  updateHero(dt) {
    this.energy = Math.min(HERO_ENERGY_MAX, this.energy + dt * 2.4);
    this.heroCd -= dt;
    if (this.heroCd > 0 || !this.enemies.length) return;
    const weapon = WEAPONS[this.weaponId];
    const origin = { x: 7, y: 7 };
    const ranked = this.enemies
      .filter((enemy) => enemy.hp > 0)
      .map((enemy) => ({ enemy, d: this.dist(origin, this.pos(enemy)) }))
      .sort((a, b) => a.d - b.d);
    if (!ranked.length) return;
    const primary = ranked[0].enemy;
    const dmg = this.heroDamage(weapon, ranked[0].d);
    if (this.weaponId === "shotgun") {
      const pack = ranked.filter((item) => this.dist(this.pos(primary), this.pos(item.enemy)) <= 1.8).slice(0, 3);
      for (const item of pack) this.hurtEnemy(item.enemy, dmg, origin, "#f3ead7");
    } else if (this.weaponId === "coil") {
      this.chain(primary, dmg, 2, 0.7, origin, "#8ec7ff");
    } else {
      this.hurtEnemy(primary, dmg, origin, "#f3ead7");
    }
    if (Math.random() < this.mods.blast) this.splash(primary, dmg * 0.4, 0.9, 1, origin, "#f0c14d", false);
    this.heroCd = weapon.rate;
    this.energy = Math.min(HERO_ENERGY_MAX, this.energy + 1.4);
  }

  heroDamage(weapon, distance) {
    let dmg = weapon.dmg * this.mods.heroDmg;
    if (this.weaponId === "shotgun") {
      if (distance <= 3) dmg *= 1.45;
      else if (distance >= 6) dmg *= 0.55;
    }
    if (this.weaponId === "sniper" && distance >= 5) dmg *= 1.4;
    return dmg;
  }

  castUlt() {
    if (this.phase !== "combat") return { ok: false, reason: "战斗时才能放" };
    if (this.energy < HERO_ENERGY_MAX) return { ok: false, reason: "能量还没满" };
    this.energy = 0;
    const origin = { x: 7, y: 7 };
    if (this.heroId === "engineer") {
      for (const building of this.buildings) {
        building.hp = Math.min(this.maxHp(building), building.hp + this.maxHp(building) * 0.55);
      }
      for (const enemy of [...this.enemies]) this.hurtEnemy(enemy, 18, origin, "#9ad7a4", false);
      this.toast("紧急抢修");
    } else if (this.heroId === "storm") {
      for (const enemy of this.enemies) enemy.freezeT = Math.max(enemy.freezeT, 2.6);
      this.chainAll(26, "#b7d7ff");
      this.toast("静电场");
    } else {
      for (const enemy of [...this.enemies]) this.hurtEnemy(enemy, 36, origin, "#ffb088", false);
      this.toast("轨道轰炸");
    }
    this.banner = HEROES[this.heroId].ult;
    this.bannerT = 1.2;
    return { ok: true };
  }

  chainAll(dmg, color) {
    const origin = { x: 7, y: 7 };
    for (const enemy of [...this.enemies]) this.hurtEnemy(enemy, dmg, origin, color, false);
  }

  chain(primary, dmg, jumps, falloff, origin, color, damagePrimary = true) {
    const hit = new Set([primary.id]);
    let current = primary;
    let power = dmg;
    if (damagePrimary) this.hurtEnemy(primary, dmg, origin, color, true);
    for (let i = 0; i < jumps; i++) {
      power *= falloff;
      let next = null;
      let best = 2.4;
      for (const enemy of this.enemies) {
        if (hit.has(enemy.id) || enemy.hp <= 0) continue;
        const d = this.dist(this.pos(current), this.pos(enemy));
        if (d < best) {
          best = d;
          next = enemy;
        }
      }
      if (!next) break;
      hit.add(next.id);
      this.bolt(this.pos(current), this.pos(next), color);
      this.hurtEnemy(next, power, null, color, false);
      current = next;
    }
  }

  splash(primary, dmg, radius, mul, origin, color, procPrimary = true) {
    const center = this.pos(primary);
    for (const enemy of [...this.enemies]) {
      if (enemy.hp <= 0) continue;
      const d = this.dist(center, this.pos(enemy));
      if (d > radius) continue;
      const amount = enemy.id === primary.id ? dmg : dmg * mul;
      this.hurtEnemy(enemy, amount, origin, color, procPrimary && enemy.id === primary.id);
    }
  }

  hurtEnemy(enemy, amount, from, color = "#fff4df", proc = true) {
    if (enemy.hp <= 0 || amount <= 0) return;
    enemy.hp -= amount;
    enemy.flash = 0.08;
    if (from) this.bolt(from, this.pos(enemy), color);
    if (proc) this.onHitEffects(enemy);
    if (amount >= 1 && Math.random() < 0.35) {
      this.floater(this.pos(enemy).x, this.pos(enemy).y - 0.2, `${Math.round(amount)}`, "#fff4df");
    }
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  onHitEffects(enemy) {
    if (enemy.hp <= 0 || this._procDepth > 0) return;
    this._procDepth += 1;
    const fire = this.bonds.fire ?? 0;
    const ice = this.bonds.ice ?? 0;
    const lightning = this.bonds.lightning ?? 0;
    const poison = this.bonds.poison ?? 0;
    if (fire >= 2) {
      enemy.burnT = Math.max(enemy.burnT, fire >= 3 ? 2.4 : 1.6);
      enemy.burnDps = Math.max(enemy.burnDps, fire >= 3 ? 6 : 3);
    }
    if (ice >= 2) this.applySlow(enemy, ice >= 3 ? 0.45 : 0.62, ice >= 3 ? 1.4 : 0.9);
    if (poison >= 2) {
      enemy.poisonT = Math.max(enemy.poisonT, 2);
      enemy.poisonDps = Math.max(enemy.poisonDps, poison >= 3 ? 5 : 2.5);
    }
    if (lightning >= 2 && Math.random() < (lightning >= 3 ? 0.45 : 0.25)) {
      this.chain(enemy, lightning >= 3 ? 8 : 5, 1, 0.8, this.pos(enemy), "#e6c15a", false);
    }
    this._procDepth -= 1;
  }

  applySlow(enemy, factor, duration) {
    enemy.slow = Math.min(enemy.slow, factor);
    enemy.slowT = Math.max(enemy.slowT, duration);
  }

  killEnemy(enemy) {
    const gold = Math.max(1, Math.round(enemy.gold * this.mods.goldFind));
    this.gold += gold;
    this.goldEarned += gold;
    this.kills += 1;
    this.energy = Math.min(HERO_ENERGY_MAX, this.energy + 4);
    this.floater(this.pos(enemy).x, this.pos(enemy).y, `+${gold}`, "#f0c14d");
  }

  onWaveCleared() {
    if (this.wave >= WAVES.length) {
      this.finish("win");
      return;
    }
    this.draft = this.drawUpgrades();
    if (!this.draft.length) {
      this.phase = "plan";
      this.tipIndex = (this.tipIndex + 1) % 6;
      return;
    }
    this.phase = "draft";
    this.banner = "这一波守住了";
    this.bannerT = 1.2;
  }

  drawUpgrades() {
    const pool = [...this.upgradesLeft];
    const picks = [];
    while (picks.length < 3 && pool.length) {
      const index = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(index, 1)[0]);
    }
    return picks;
  }

  pickUpgrade(id) {
    if (this.phase !== "draft") return { ok: false };
    if (!this.draft.includes(id)) return { ok: false };
    this.applyUpgrade(id);
    this.upgradesLeft = this.upgradesLeft.filter((item) => item !== id);
    this.draft = [];
    this.phase = "plan";
    this.tipIndex = (this.tipIndex + 1) % 6;
    const found = UPGRADES.find((item) => item.id === id);
    this.toast(found ? found.name : "强化");
    return { ok: true };
  }

  applyUpgrade(id) {
    if (id === "aspd") this.mods.towerAspd *= 1.2;
    if (id === "tower") this.mods.towerDmg *= 1.25;
    if (id === "chill") this.mods.slowPower *= 1.35;
    if (id === "repair") this.mods.repairMul *= 0.7;
    if (id === "wall") {
      const before = this.mods.wallHp;
      this.mods.wallHp *= 1.4;
      for (const building of this.buildings) {
        if (building.kind !== "wall") continue;
        const oldMax = Math.round(BUILDINGS.wall.hp * (1 + (building.level - 1) * 0.4) * before);
        const next = this.maxHp(building);
        building.hp += Math.max(0, next - oldMax);
      }
    }
    if (id === "blast") this.mods.blast = Math.min(0.75, this.mods.blast + 0.3);
    if (id === "bounty") this.mods.goldFind *= 1.3;
    if (id === "interest") this.mods.interestPercent += 5;
    if (id === "armor") {
      this.coreMax += 80;
      this.coreHp = Math.min(this.coreMax, this.coreHp + 80);
    }
    if (id === "hero") this.mods.heroDmg *= 1.25;
  }

  finish(phase) {
    if (this.ended) return;
    this.ended = true;
    this.phase = phase;
    this.banner = phase === "win" ? "八波守住了" : "核心被摧毁";
    this.bannerT = 2;
  }

  synergy() {
    const present = new Set(this.buildings.map((building) => building.type));
    return {
      firepower: seriesProgress(present, SERIES.firepower.need),
      control: seriesProgress(present, SERIES.control.need),
    };
  }

  centerOf(building) {
    return { x: building.x + building.w / 2 - 0.5, y: building.y + building.h / 2 - 0.5 };
  }

  pos(enemy) {
    if (!enemy.move) return { x: enemy.cx, y: enemy.cy };
    const t = Math.max(0, Math.min(1, enemy.progress));
    return {
      x: enemy.move.x + (enemy.move.nx - enemy.move.x) * t,
      y: enemy.move.y + (enemy.move.ny - enemy.move.y) * t,
    };
  }

  dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  bolt(from, to, color) {
    this.fx.push({ from, to, color, age: 0, life: 0.16 });
    if (this.fx.length > 80) this.fx.splice(0, this.fx.length - 80);
  }

  floater(x, y, text, color) {
    this.texts.push({ x, y, text, color, age: 0, life: 0.7 });
    if (this.texts.length > 36) this.texts.splice(0, this.texts.length - 36);
  }

  toast(text) {
    const last = this.toasts[this.toasts.length - 1];
    if (last && last.text === text && last.life > 1.3) return;
    this.toasts.push({ text, life: 2.1 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  cellAt(x, y) {
    if (!inBounds(x, y)) return null;
    return this.occupancy[y][x];
  }

  summary() {
    return {
      wave: this.wave,
      kills: this.kills,
      goldEarned: this.goldEarned,
      interestEarned: this.interestEarned,
      placed: this.placed,
      hero: HEROES[this.heroId].name,
      weapon: WEAPONS[this.weaponId].name,
    };
  }
}

export function threatMap(game) {
  const map = new Map();
  for (const enemy of game.enemies) {
    if (enemy.target?.type !== "building") continue;
    map.set(enemy.target.id, (map.get(enemy.target.id) ?? 0) + 1);
  }
  return map;
}

export { HERO_ENERGY_MAX };
