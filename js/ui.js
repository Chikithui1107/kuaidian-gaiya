import {
  BUILDINGS,
  BUILD_ORDER,
  ELEMENTS,
  ENEMY_TYPES,
  GEM_COST,
  GEM_SLOTS,
  HEROES,
  SERIES,
  UPGRADES,
  TIPS,
  WAVES,
  WEAPONS,
} from "./config.js";
import { computeBonds } from "./logic.js";
import { HERO_ENERGY_MAX } from "./sim.js";
import {
  buyGem,
  equippedGems,
  gemLabel,
  grantWin,
  noteLoss,
  saveProfile,
  toggleEquip,
} from "./storage.js";

export function createUi(ctx) {
  const { game, view, profile } = ctx;
  const $ = (id) => document.getElementById(id);

  const chips = $("chips");
  for (const type of BUILD_ORDER) {
    const def = BUILDINGS[type];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.type = type;
    button.innerHTML = `<span>${def.name}</span><small>${def.w}×${def.h} · ${def.cost}</small>`;
    button.addEventListener("click", () => {
      view.selectedId = null;
      view.tool = view.tool === type ? null : type;
      sync();
    });
    chips.appendChild(button);
  }

  $("btn-rotate").addEventListener("click", () => {
    view.rotated = !view.rotated;
  });
  $("btn-wave").addEventListener("click", () => {
    const result = game.beginWave();
    if (!result.ok && result.reason) game.toast(result.reason);
  });
  $("btn-ult").addEventListener("click", () => {
    const result = game.castUlt();
    if (!result.ok && result.reason) game.toast(result.reason);
  });
  $("btn-upgrade").addEventListener("click", () => act((id) => game.upgrade(id)));
  $("btn-repair").addEventListener("click", () => act((id) => game.repair(id)));
  $("btn-sell").addEventListener("click", () => {
    if (!view.selectedId) return;
    const result = game.sell(view.selectedId);
    if (!result.ok) {
      if (result.reason) game.toast(result.reason);
      return;
    }
    view.selectedId = null;
  });
  $("btn-back").addEventListener("click", () => {
    view.selectedId = null;
  });
  $("btn-start").addEventListener("click", () => ctx.onStart());
  $("btn-loadout").addEventListener("click", () => show("loadout"));
  $("btn-gems").addEventListener("click", () => show("gems"));
  $("btn-loadout-back").addEventListener("click", () => show("menu"));
  $("btn-gems-back").addEventListener("click", () => show("menu"));
  $("btn-again").addEventListener("click", () => ctx.onStart());
  $("btn-home").addEventListener("click", () => {
    game.phase = "menu";
    show("menu");
  });
  $("btn-buy-gem").addEventListener("click", () => {
    const gem = buyGem(profile);
    if (!gem) game.toast("碎片不够");
    renderGems();
    renderMenuStats();
  });

  function act(fn) {
    if (!view.selectedId) return;
    const result = fn(view.selectedId);
    if (result && !result.ok && result.reason) game.toast(result.reason);
  }

  function show(name) {
    $("screen-menu").hidden = name !== "menu";
    $("screen-loadout").hidden = name !== "loadout";
    $("screen-gems").hidden = name !== "gems";
    $("screen-result").hidden = name !== "result";
    const playing = name === "play";
    document.getElementById("app").dataset.mode = playing ? "play" : "menu";
    if (name === "loadout") renderLoadout();
    if (name === "gems") renderGems();
    if (name === "menu") renderMenuStats();
  }

  function renderMenuStats() {
    $("menu-stamina").textContent = `体力 ${profile.stamina}/${5}`;
    $("menu-shards").textContent = `碎片 ${profile.shards}`;
    $("menu-record").textContent = profile.wins ? `通关 ${profile.wins} 次` : "还没有通关";
  }

  function renderLoadout() {
    const host = $("loadout-body");
    host.replaceChildren();
    host.append(sectionTitle("角色"));
    const heroes = document.createElement("div");
    heroes.className = "choice-grid";
    for (const [id, hero] of Object.entries(HEROES)) {
      heroes.append(choiceCard(hero.name, `大招「${hero.ult}」：${hero.ultDesc}`, profile.hero === id, () => {
        profile.hero = id;
        saveProfile(profile);
        renderLoadout();
      }));
    }
    host.append(heroes);
    host.append(sectionTitle("武器"));
    const weapons = document.createElement("div");
    weapons.className = "choice-grid";
    for (const [id, weapon] of Object.entries(WEAPONS)) {
      weapons.append(choiceCard(weapon.name, weapon.desc, profile.weapon === id, () => {
        profile.weapon = id;
        saveProfile(profile);
        renderLoadout();
      }));
    }
    host.append(weapons);
    const note = document.createElement("p");
    note.className = "fine";
    note.textContent =
      "角色会自动打离核心最近的敌人，整张地图都打得到。大招能量在战斗中慢慢涨，打中、击杀敌人涨得更快，满了点大招按钮就能放。";
    host.append(note);
  }

  function renderGems() {
    const slots = $("gem-slots");
    slots.replaceChildren();
    const equipped = equippedGems(profile);
    for (let i = 0; i < GEM_SLOTS; i++) {
      const gem = equipped[i];
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = "gem-slot";
      if (gem) {
        const label = gemLabel(gem);
        slot.innerHTML = `<b style="color:${label.color}">${label.title}</b><small>${label.line}</small>`;
        slot.addEventListener("click", () => {
          toggleEquip(profile, gem.id);
          renderGems();
        });
      } else {
        slot.innerHTML = `<b>空槽</b><small>点下面的宝石装上</small>`;
      }
      slots.append(slot);
    }

    const bonds = computeBonds(equipped);
    const bondHost = $("gem-bonds");
    bondHost.replaceChildren();
    for (const [key, meta] of Object.entries(ELEMENTS)) {
      const count = bonds[key] ?? 0;
      const row = document.createElement("p");
      const head = document.createElement("b");
      head.textContent = `${meta.name} · ${bondStatus(count)}`;
      row.append(head, meta.bond);
      if (count >= 2) row.className = "bond-on";
      bondHost.append(row);
    }

    const list = $("gem-list");
    list.replaceChildren();
    for (const gem of profile.gems) {
      const label = gemLabel(gem);
      const on = profile.equipped.includes(gem.id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = on ? "gem-item on" : "gem-item";
      button.innerHTML = `<b style="color:${label.color}">${label.title}</b><small>${label.line}${on ? " · 已装备" : ""}</small>`;
      button.addEventListener("click", () => {
        const was = profile.equipped.includes(gem.id);
        const full = profile.equipped.every(Boolean);
        if (!was && full) {
          game.toast("四个槽都满了");
          return;
        }
        toggleEquip(profile, gem.id);
        renderGems();
      });
      list.append(button);
    }
    $("btn-buy-gem").textContent = `用 ${GEM_COST} 碎片换一颗`;
    $("btn-buy-gem").disabled = profile.shards < GEM_COST;
    $("gem-shards").textContent = `碎片 ${profile.shards}`;
  }

  function sync() {
    const playing = game.phase === "plan" || game.phase === "combat" || game.phase === "draft" || game.phase === "win" || game.phase === "lose";
    if (document.getElementById("app").dataset.mode === "play" && !playing && game.phase === "menu") {
      show("menu");
    }

    const waveTotal = WAVES.length;
    $("wave-num").textContent = game.phase === "combat" ? `${game.wave}/${waveTotal}` : game.phase === "plan" ? `准备 ${game.wave + 1}` : `${Math.min(game.wave, waveTotal)}/${waveTotal}`;
    $("core-text").textContent = `${Math.max(0, Math.ceil(game.coreHp))} / ${game.coreMax}`;
    $("core-bar").style.width = `${Math.max(0, (game.coreHp / game.coreMax) * 100)}%`;
    $("gold").textContent = String(game.gold);

    const interest = game.interestPreview();
    $("interest").textContent = `开战利息 +${interest} · ${game.mods.interestPercent}% · 上限 ${game.mods.interestCap}`;

    const syn = game.synergy();
    $("synergy").textContent = `${SERIES.firepower.name} ${syn.firepower.have}/${syn.firepower.need} · ${SERIES.control.name} ${syn.control.have}/${syn.control.need}`;
    $("synergy").classList.toggle("bond-on", syn.firepower.ready || syn.control.ready);

    const hero = HEROES[game.heroId];
    const weapon = WEAPONS[game.weaponId];
    $("hero-name").textContent = hero.name;
    $("weapon-name").textContent = `${weapon.name} · ${hero.ult}`;
    $("energy-bar").style.width = `${(game.energy / HERO_ENERGY_MAX) * 100}%`;
    const ultReady = game.energy >= HERO_ENERGY_MAX && game.phase === "combat";
    $("btn-ult").disabled = !ultReady;
    $("btn-ult").textContent = ultReady ? hero.ult : "蓄力中";

    for (const button of chips.querySelectorAll(".chip")) {
      button.classList.toggle("on", button.dataset.type === view.tool);
    }
    const def = view.tool ? BUILDINGS[view.tool] : null;
    $("btn-rotate").hidden = !def || def.w === def.h;

    const selected = view.selectedId ? game.buildingById(view.selectedId) : null;
    if (view.selectedId && !selected) view.selectedId = null;
    $("inspect").hidden = !selected;
    $("palette").hidden = Boolean(selected);
    if (selected) {
      const info = BUILDINGS[selected.type];
      const max = game.maxHp(selected);
      $("inspect-name").textContent = `${info.name}  Lv.${selected.level}`;
      $("inspect-meta").textContent = `生命 ${Math.ceil(selected.hp)}/${max} · ${selected.w}×${selected.h}`;
      const up = game.upgradeCost(selected);
      $("btn-upgrade").textContent = selected.level >= 3 ? "已满级" : `升级 ${up}`;
      $("btn-upgrade").disabled = selected.level >= 3 || game.gold < up;
      const repair = game.repairCost(selected);
      $("btn-repair").textContent = repair ? `维修 ${repair}` : "完好";
      $("btn-repair").disabled = !repair || game.gold < repair;
      $("btn-sell").textContent = `拆除 +${Math.round(selected.invested * 0.5)}`;
    }

    const next = WAVES[game.wave];
    if (game.phase === "plan" && next) {
      const kinds = [...new Set(next.mix)].map((kind) => ENEMY_TYPES[kind].name).join("、");
      $("btn-wave").disabled = false;
      $("btn-wave").textContent = `开战 · 利息 +${interest}`;
      $("tip").textContent = `第 ${game.wave + 1} 波 ${next.count} 只，${kinds}。${TIPS[game.tipIndex % TIPS.length]}`;
    } else if (game.phase === "combat") {
      const left = game.spawnQueue.length + game.enemies.length;
      $("btn-wave").disabled = true;
      $("btn-wave").textContent = `战斗中 · 还剩 ${left}`;
      $("tip").textContent = "还能边打边盖。墙会改道，堵死了就会被拆。";
    } else if (game.phase === "draft") {
      $("btn-wave").disabled = true;
      $("btn-wave").textContent = "先选一个强化";
      $("tip").textContent = "";
    } else {
      $("btn-wave").disabled = true;
      $("tip").textContent = "";
    }

    const toast = game.toasts[game.toasts.length - 1];
    const toastEl = $("toast");
    toastEl.hidden = !toast;
    toastEl.textContent = toast ? toast.text : "";

    $("screen-draft").hidden = game.phase !== "draft";
    if (game.phase === "draft") renderDraft();

    if ((game.phase === "win" || game.phase === "lose") && !game.settled) {
      game.settled = true;
      settle();
    }
  }

  let draftKey = "";
  function renderDraft() {
    const key = game.draft.join(",");
    if (key === draftKey) return;
    draftKey = key;
    const host = $("draft-cards");
    host.replaceChildren();
    for (const id of game.draft) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "draft-card";
      const found = upgradesById(id);
      card.innerHTML = `<b>${found.name}</b><span>${found.desc}</span>`;
      card.addEventListener("click", () => {
        game.pickUpgrade(id);
        draftKey = "";
      });
      host.append(card);
    }
  }

  function settle() {
    const summary = game.summary();
    const win = game.phase === "win";
    let reward = null;
    if (win) reward = grantWin(profile);
    else noteLoss(profile);
    game.reward = reward;
    $("result-kicker").textContent = win ? "八波守住了" : "这一局结束";
    $("result-title").textContent = win ? "核心还在" : "核心被摧毁";
    const lines = [
      `${summary.hero} / ${summary.weapon}`,
      `击破 ${summary.kills} · 建造 ${summary.placed} · 利息共 +${summary.interestEarned}`,
    ];
    if (win && reward?.rewarded) {
      const label = gemLabel(reward.gem);
      lines.push(`体力 -1，还剩 ${reward.stamina}。碎片 +${reward.shards}。`);
      lines.push(`新宝石：${label.title} ${label.line}`);
    } else if (win) {
      lines.push("体力已经是 0。这次没有扣体力，也没有主要奖励。");
    } else {
      lines.push("失败不扣体力。换个盖法再试一次。");
    }
    $("result-copy").textContent = lines.join("\n");
    $("screen-result").hidden = false;
    renderMenuStats();
  }

  renderMenuStats();
  show("menu");
  return { sync, show };
}

function sectionTitle(text) {
  const node = document.createElement("h2");
  node.textContent = text;
  return node;
}

function choiceCard(title, desc, on, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = on ? "choice on" : "choice";
  button.innerHTML = `<b>${title}</b><span>${desc}</span>`;
  button.addEventListener("click", onClick);
  return button;
}

function bondStatus(count) {
  if (count >= 3) return "已加强";
  if (count === 2) return "已激活";
  return `还差 ${2 - count} 颗`;
}

function upgradesById(id) {
  return UPGRADES.find((item) => item.id === id) ?? { name: id, desc: "" };
}
