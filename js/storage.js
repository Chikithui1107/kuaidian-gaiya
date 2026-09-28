import {
  ELEMENTS,
  GEM_COST,
  GEM_STATS,
  QUALITIES,
  START_STAMINA,
  WIN_SHARDS,
} from "./config.js";

const KEY = "gd_kuaidian_v1";

function starterGems() {
  return [
    makeGem("fire", "towerDmg", 1),
    makeGem("fire", "heroDmg", 1),
    makeGem("ice", "wallHp", 1),
    makeGem("lightning", "goldFind", 1),
  ];
}

export function makeGem(element, stat, quality) {
  const base = QUALITIES[quality].value;
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    element,
    stat,
    quality,
    value: base,
  };
}

export function randomGem() {
  const elements = Object.keys(ELEMENTS);
  const stats = Object.keys(GEM_STATS);
  const roll = Math.random();
  const quality = roll > 0.94 ? 3 : roll > 0.7 ? 2 : 1;
  const element = elements[Math.floor(Math.random() * elements.length)];
  const stat = stats[Math.floor(Math.random() * stats.length)];
  return makeGem(element, stat, quality);
}

export function defaultProfile() {
  return {
    stamina: START_STAMINA,
    shards: 0,
    gems: starterGems(),
    equipped: [null, null, null, null],
    weapon: "mg",
    hero: "striker",
    wins: 0,
    runs: 0,
  };
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    const data = JSON.parse(raw);
    return { ...defaultProfile(), ...data, equipped: data.equipped ?? [null, null, null, null] };
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile) {
  localStorage.setItem(KEY, JSON.stringify(profile));
}

export function equippedGems(profile) {
  const byId = new Map(profile.gems.map((gem) => [gem.id, gem]));
  return profile.equipped.map((id) => (id ? byId.get(id) ?? null : null));
}

export function gemLabel(gem) {
  const element = ELEMENTS[gem.element];
  const stat = GEM_STATS[gem.stat];
  const quality = QUALITIES[gem.quality];
  const pct = Math.round(gem.value * 100);
  const sign = stat.positive ? `+${pct}%` : `-${pct}%`;
  return {
    title: `${element.name} · ${stat.name}`,
    line: `${quality.name} ${sign}`,
    color: element.color,
  };
}

/** 通关才扣体力、才发主要奖励。失败什么都不扣。 */
export function grantWin(profile) {
  profile.runs += 1;
  if (profile.stamina <= 0) {
    saveProfile(profile);
    return { rewarded: false, stamina: profile.stamina, gem: null, shards: 0 };
  }
  profile.stamina -= 1;
  profile.shards += WIN_SHARDS;
  profile.wins += 1;
  const gem = randomGem();
  profile.gems.push(gem);
  saveProfile(profile);
  return { rewarded: true, stamina: profile.stamina, gem, shards: WIN_SHARDS };
}

export function noteLoss(profile) {
  profile.runs += 1;
  saveProfile(profile);
}

export function buyGem(profile) {
  if (profile.shards < GEM_COST) return null;
  profile.shards -= GEM_COST;
  const gem = randomGem();
  profile.gems.push(gem);
  saveProfile(profile);
  return gem;
}

export function toggleEquip(profile, gemId) {
  const index = profile.equipped.indexOf(gemId);
  if (index >= 0) {
    profile.equipped[index] = null;
    saveProfile(profile);
    return;
  }
  const empty = profile.equipped.findIndex((id) => !id);
  if (empty < 0) return;
  profile.equipped[empty] = gemId;
  saveProfile(profile);
}
