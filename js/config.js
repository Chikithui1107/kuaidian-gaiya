/** 《快点盖呀》数值与内容。改平衡先看这里。 */

export const COLS = 15;
export const ROWS = 15;

/** 十字臂厚度。15 格里居中的 5 格是纵臂 / 横臂，四角只作背景。 */
export const ARM = 5;
export const ARM_START = (COLS - ARM) / 2; // 5
export const ARM_END = ARM_START + ARM - 1; // 9

/** 核心占正中 3×3。 */
export const CORE_ORIGIN = 6;
export const CORE_SIZE = 3;

export const START_GOLD = 110;
export const CORE_HP = 480;
export const INTEREST_PERCENT = 10;
export const INTEREST_CAP = 40;
export const SELL_REFUND = 0.5;
export const MAX_BUILDING_LEVEL = 3;

export const START_STAMINA = 5;
export const WIN_SHARDS = 18;
export const GEM_COST = 30;
export const GEM_SLOTS = 4;

export const BUILDINGS = {
  wall: {
    name: "墙",
    w: 1,
    h: 1,
    cost: 8,
    hp: 210,
    dmg: 0,
    rate: 1,
    range: 0,
    series: null,
    blurb: "改路线。路径被堵死时会被拆。",
    color: "#c4bfb6",
    accent: "#8d877c",
  },
  gun: {
    name: "机枪塔",
    w: 2,
    h: 2,
    cost: 42,
    hp: 250,
    dmg: 12,
    rate: 0.38,
    range: 3.8,
    series: "firepower",
    blurb: "最常见的 2×2 火力。",
    color: "#e15a3a",
    accent: "#7c2618",
  },
  ice: {
    name: "冰塔",
    w: 2,
    h: 1,
    cost: 46,
    hp: 200,
    dmg: 5,
    rate: 0.55,
    range: 3.5,
    slow: 0.5,
    slowTime: 1.5,
    series: "control",
    blurb: "2×1，让敌人变慢。",
    color: "#79c7d8",
    accent: "#1d4e5c",
  },
  sniper: {
    name: "狙击炮",
    w: 3,
    h: 1,
    cost: 62,
    hp: 190,
    dmg: 36,
    rate: 1.15,
    range: 8.2,
    series: "firepower",
    blurb: "3×1，慢，但打得很远。",
    color: "#e0b15a",
    accent: "#6a4a12",
  },
  arc: {
    name: "电弧塔",
    w: 3,
    h: 2,
    cost: 92,
    hp: 280,
    dmg: 9,
    rate: 0.52,
    range: 3.6,
    chains: 2,
    chainFalloff: 0.72,
    series: "control",
    blurb: "3×2，电击会跳到旁边的敌人。",
    color: "#8d7cf6",
    accent: "#34286e",
  },
  rocket: {
    name: "火箭巢",
    w: 2,
    h: 3,
    cost: 84,
    hp: 270,
    dmg: 18,
    rate: 0.82,
    range: 4.5,
    splash: 1.05,
    splashMul: 0.6,
    series: null,
    blurb: "2×3，小范围爆炸。",
    color: "#e8873a",
    accent: "#6a3812",
  },
  cannon: {
    name: "重炮",
    w: 3,
    h: 3,
    cost: 150,
    hp: 460,
    dmg: 32,
    rate: 1.2,
    range: 5.1,
    splash: 1.4,
    splashMul: 0.7,
    series: "firepower",
    blurb: "3×3 很强，但几乎占满一条路。",
    color: "#8f3d3d",
    accent: "#3c1616",
  },
};

export const BUILD_ORDER = ["wall", "gun", "ice", "sniper", "rocket", "arc", "cannon"];

export const SERIES = {
  firepower: {
    name: "火力网",
    need: ["gun", "sniper", "cannon"],
    labels: ["机枪塔", "狙击炮", "重炮"],
    desc: "三种火力建筑都在场时，它们伤害 +20%。",
  },
  control: {
    name: "控场",
    need: ["ice", "arc"],
    labels: ["冰塔", "电弧塔"],
    desc: "冰塔和电弧塔同时在场时，减速更强，电弧多跳一次。",
  },
};

/** 敌人偏爱核心。分值 = 走近距离 + 偏见，越小越优先。偏见越高越死盯核心。 */
export const TOWER_BIAS = {
  fast: 7,
  normal: 4,
  tank: 1,
};

export const ENEMY_TYPES = {
  normal: { name: "杂兵", hp: 1, speed: 1, dmg: 1, gold: 1, size: 0.28, color: "#e24b4b" },
  fast: { name: "突进", hp: 0.72, speed: 1.48, dmg: 0.7, gold: 0.85, size: 0.22, color: "#f08a3c" },
  tank: { name: "攻城", hp: 2.6, speed: 0.7, dmg: 1.85, gold: 1.7, size: 0.38, color: "#8e4a6a" },
};

export const WAVES = [
  { count: 8, hp: 30, speed: 1.22, dmg: 8, gold: 5, interval: 1.15, mix: ["normal"] },
  { count: 12, hp: 38, speed: 1.28, dmg: 9, gold: 5, interval: 1.0, mix: ["normal", "normal", "fast"] },
  { count: 14, hp: 48, speed: 1.32, dmg: 10, gold: 6, interval: 0.92, mix: ["normal", "fast", "normal"] },
  { count: 16, hp: 58, speed: 1.36, dmg: 11, gold: 6, interval: 0.86, mix: ["normal", "fast", "tank"] },
  { count: 18, hp: 72, speed: 1.4, dmg: 12, gold: 7, interval: 0.8, mix: ["normal", "tank", "fast"] },
  { count: 18, hp: 88, speed: 1.44, dmg: 13, gold: 7, interval: 0.74, mix: ["normal", "fast", "tank", "fast"] },
  { count: 22, hp: 108, speed: 1.48, dmg: 14, gold: 8, interval: 0.68, mix: ["fast", "tank", "normal", "tank"] },
  { count: 24, hp: 130, speed: 1.52, dmg: 16, gold: 9, interval: 0.6, mix: ["normal", "fast", "tank", "tank"] },
];

export const HEROES = {
  striker: {
    name: "突击手",
    ult: "轨道轰炸",
    ultDesc: "打击场上所有敌人。",
    blurb: "哪一边漏了，就补哪一边。",
  },
  engineer: {
    name: "工程师",
    ult: "紧急抢修",
    ultDesc: "修好所有建筑，并震开敌人。",
    blurb: "大招是把基地拉回来。",
  },
  storm: {
    name: "霜雷",
    ult: "静电场",
    ultDesc: "冻结全部敌人，并劈下闪电。",
    blurb: "给炮塔争取一段输出时间。",
  },
};

export const WEAPONS = {
  mg: { name: "机枪", desc: "快速单点。全图都能打到，用来补漏。", rate: 0.28, dmg: 3 },
  shotgun: {
    name: "霰弹枪",
    desc: "全图锁定，但离核心越近越痛，并溅到目标旁边的敌人。",
    rate: 0.48,
    dmg: 5,
  },
  sniper: { name: "狙击枪", desc: "射得很慢。目标越远，这一发越痛。", rate: 1.15, dmg: 11 },
  coil: { name: "电磁武器", desc: "命中后跳到附近的敌人身上。", rate: 0.55, dmg: 6 },
};

export const UPGRADES = [
  { id: "aspd", name: "快速装填", desc: "炮塔攻击速度 +20%。" },
  { id: "tower", name: "炮塔强化", desc: "炮塔伤害 +25%。" },
  { id: "chill", name: "深寒", desc: "冰冻和减速更强。" },
  { id: "repair", name: "抢修", desc: "维修花费 -30%。" },
  { id: "wall", name: "加固", desc: "墙壁生命 +40%。" },
  { id: "blast", name: "爆裂弹", desc: "攻击有 30% 概率小范围爆炸。" },
  { id: "bounty", name: "赏金", desc: "敌人掉落的金币 +30%。" },
  { id: "interest", name: "精算", desc: "利息 +5%（每波约 15%），上限仍是 40。" },
  { id: "armor", name: "核心装甲", desc: "核心生命上限 +80，并立刻回复 80。" },
  { id: "hero", name: "角色过载", desc: "角色伤害 +25%。" },
];

export const ELEMENTS = {
  fire: { name: "火", icon: "火", color: "#e4572e" },
  ice: { name: "冰", icon: "冰", color: "#7ec8e3" },
  lightning: { name: "雷", icon: "雷", color: "#e6c15a" },
  poison: { name: "毒", icon: "毒", color: "#8fbf6a" },
};

export const GEM_STATS = {
  towerDmg: { name: "炮塔伤害", positive: true },
  heroDmg: { name: "角色伤害", positive: true },
  wallHp: { name: "城墙生命", positive: true },
  goldFind: { name: "金币掉落", positive: true },
  repair: { name: "维修开销", positive: false },
};

export const QUALITIES = {
  1: { name: "普通", mul: 1, value: 0.06 },
  2: { name: "稀有", mul: 1, value: 0.1 },
  3: { name: "史诗", mul: 1, value: 0.16 },
};

export const TIPS = [
  "四个角不能盖。敌人从上下左右进来。",
  "墙能让敌人绕路。路被堵死时，它们会拆墙。",
  "盖在脸上：敌人会停下来打建筑。盖在路边：它们绕过去，吃你的炮。",
  "2×2 省地方。3×3 很强，但一条路差不多被它占满。",
  "金币留着，开战时吃 10% 利息，四舍五入，上限 40。",
  "角色射程铺满全图，用来补漏，不是主力。",
];
