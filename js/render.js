import { BUILDINGS, COLS, ROWS, ENEMY_TYPES } from "./config.js";
import { cellsFor, isCoreCell, isPlayable, orientedSize } from "./logic.js";

const CORE = { x: 6, y: 6, w: 3, h: 3 };

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let layout = { ox: 0, oy: 0, cell: 24, w: 1, h: 1 };

  function resize() {
    const stage = canvas.parentElement;
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = Math.max(0, Math.floor(Math.min(w / COLS, h / ROWS)));
    layout = {
      ox: Math.floor((w - cell * COLS) / 2),
      oy: Math.floor((h - cell * ROWS) / 2),
      cell,
      w,
      h,
    };
  }

  function cellFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (!layout.cell) return null;
    const cx = Math.floor((x - layout.ox) / layout.cell);
    const cy = Math.floor((y - layout.oy) / layout.cell);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return null;
    return [cx, cy];
  }

  function draw(game, view) {
    resize();
    const { ox, oy, cell, w, h } = layout;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#14110e";
    ctx.fillRect(0, 0, w, h);
    if (cell < 8) return;

    const shake = game.shake > 0 ? game.shake : 0;
    ctx.save();
    if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    drawTiles(ctx, ox, oy, cell);
    drawCore(ctx, ox, oy, cell, game);
    drawLabels(ctx, ox, oy, cell);

    const threats = new Map();
    for (const enemy of game.enemies) {
      if (enemy.target?.type === "building") {
        threats.set(enemy.target.id, (threats.get(enemy.target.id) ?? 0) + 1);
      }
    }

    for (const building of game.buildings) {
      drawBuilding(ctx, ox, oy, cell, building, game, {
        selected: view.selectedId === building.id,
        threat: threats.get(building.id) ?? 0,
      });
    }

    if (view.tool && view.hover && (game.phase === "plan" || game.phase === "combat")) {
      drawGhost(ctx, ox, oy, cell, game, view);
    }

    if (view.selectedId && !view.tool) {
      const selected = game.buildingById(view.selectedId);
      if (selected && selected.kind === "tower") drawRange(ctx, ox, oy, cell, game.centerOf(selected), BUILDINGS[selected.type].range, "rgba(242,193,77,0.28)");
    }

    for (const enemy of game.enemies) drawEnemy(ctx, ox, oy, cell, game, enemy);
    for (const bolt of game.fx) drawBolt(ctx, ox, oy, cell, bolt);
    for (const text of game.texts) drawText(ctx, ox, oy, cell, text);

    if (game.bannerT > 0 && game.banner) {
      ctx.globalAlpha = Math.min(1, game.bannerT);
      ctx.fillStyle = "#f3ead7";
      ctx.font = `700 ${Math.max(18, cell)}px "Songti SC", "PingFang SC", serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(game.banner, ox + (cell * COLS) / 2, oy + cell * 2.2);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  return { draw, cellFromEvent };
}

function tileRect(ox, oy, cell, x, y, pad = 1.5) {
  return [ox + x * cell + pad, oy + y * cell + pad, cell - pad * 2, cell - pad * 2];
}

function drawTiles(ctx, ox, oy, cell) {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const [rx, ry, rw, rh] = tileRect(ox, oy, cell, x, y, 1);
      if (!isPlayable(x, y)) {
        ctx.fillStyle = "#0e0c0a";
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = "rgba(243,234,215,0.04)";
        ctx.beginPath();
        ctx.moveTo(rx, ry + rh);
        ctx.lineTo(rx + rw, ry);
        ctx.stroke();
        continue;
      }
      if (isCoreCell(x, y)) continue;
      ctx.fillStyle = (x + y) % 2 === 0 ? "#2a241e" : "#322b24";
      roundRect(ctx, rx, ry, rw, rh, 3);
      ctx.fill();
    }
  }
}

function drawCore(ctx, ox, oy, cell, game) {
  const x = ox + CORE.x * cell + 3;
  const y = oy + CORE.y * cell + 3;
  const w = CORE.w * cell - 6;
  const h = CORE.h * cell - 6;
  ctx.save();
  ctx.shadowColor = game.coreFlash > 0 ? "#ff6b6b" : "rgba(226,182,87,0.45)";
  ctx.shadowBlur = game.coreFlash > 0 ? 18 : 12;
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, game.coreFlash > 0 ? "#ffb4a8" : "#ffe1a0");
  grad.addColorStop(1, game.coreFlash > 0 ? "#c44536" : "#e09a3e");
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#3a2412";
  ctx.font = `700 ${Math.max(12, cell * 0.7)}px "Songti SC", "PingFang SC", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("核心", x + w / 2, y + h / 2);
  ctx.restore();
}

function drawLabels(ctx, ox, oy, cell) {
  ctx.fillStyle = "rgba(243,234,215,0.28)";
  ctx.font = `600 ${Math.max(10, cell * 0.42)}px "PingFang SC", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const marks = [
    ["上", 7, 0],
    ["下", 7, 14],
    ["左", 0, 7],
    ["右", 14, 7],
  ];
  for (const [text, x, y] of marks) {
    ctx.fillText(text, ox + (x + 0.5) * cell, oy + (y + 0.5) * cell);
  }
}

function drawBuilding(ctx, ox, oy, cell, building, game, flags) {
  const def = BUILDINGS[building.type];
  const x = ox + building.x * cell + 2;
  const y = oy + building.y * cell + 2;
  const w = building.w * cell - 4;
  const h = building.h * cell - 4;
  ctx.save();
  ctx.fillStyle = flags.selected ? "#fff4df" : def.color;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  if (building.flash > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
  }
  ctx.fillStyle = def.accent;
  ctx.fillRect(x + 4, y + 4, Math.max(4, w * 0.18), Math.max(4, h * 0.18));
  ctx.fillStyle = "#1a120e";
  ctx.font = `700 ${Math.max(10, cell * 0.38)}px "PingFang SC", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(def.name.slice(0, 2), x + w / 2, y + h / 2 - 2);
  if (building.level > 1) {
    ctx.font = `700 ${Math.max(9, cell * 0.32)}px "PingFang SC", sans-serif`;
    ctx.fillText(`${building.level}`, x + w - 8, y + 10);
  }
  const max = game.maxHp(building);
  const ratio = Math.max(0, building.hp / max);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x + 4, y + h - 7, w - 8, 3);
  ctx.fillStyle = ratio > 0.35 ? "#d8efe0" : "#ff8d8d";
  ctx.fillRect(x + 4, y + h - 7, (w - 8) * ratio, 3);
  if (flags.threat > 0) {
    ctx.strokeStyle = "#ff5a3c";
    ctx.lineWidth = 2;
    roundRect(ctx, x - 1, y - 1, w + 2, h + 2, 7);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGhost(ctx, ox, oy, cell, game, view) {
  const def = BUILDINGS[view.tool];
  if (!def || !view.hover) return;
  const { w, h } = orientedSize(def, view.rotated);
  const [x, y] = view.hover;
  const reason = cellsFor(x, y, w, h).some(([cx, cy]) => {
    if (!isPlayable(cx, cy) || isCoreCell(cx, cy)) return true;
    return Boolean(game.occupancy[cy]?.[cx]);
  });
  const poor = game.gold < def.cost;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = reason || poor ? "#a33b32" : def.color;
  const px = ox + x * cell + 2;
  const py = oy + y * cell + 2;
  roundRect(ctx, px, py, w * cell - 4, h * cell - 4, 6);
  ctx.fill();
  ctx.restore();
  if (!reason && def.range > 0) {
    const center = { x: x + w / 2 - 0.5, y: y + h / 2 - 0.5 };
    drawRange(ctx, ox, oy, cell, center, def.range, "rgba(243,234,215,0.22)");
  }
}

function drawRange(ctx, ox, oy, cell, center, range, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(ox + (center.x + 0.5) * cell, oy + (center.y + 0.5) * cell, range * cell, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(ctx, ox, oy, cell, game, enemy) {
  const pos = game.pos(enemy);
  const def = ENEMY_TYPES[enemy.kind];
  const px = ox + (pos.x + 0.5) * cell;
  const py = oy + (pos.y + 0.5) * cell;
  const r = cell * def.size;
  ctx.save();
  ctx.fillStyle = enemy.freezeT > 0 ? "#d5ecff" : def.color;
  ctx.beginPath();
  if (enemy.kind === "tank") {
    roundRect(ctx, px - r, py - r, r * 2, r * 2, 3);
    ctx.fill();
  } else if (enemy.kind === "fast") {
    ctx.moveTo(px, py - r);
    ctx.lineTo(px + r, py);
    ctx.lineTo(px, py + r);
    ctx.lineTo(px - r, py);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (enemy.flash > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(px, py, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  if (enemy.hp < enemy.maxHp) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(px - r, py - r - 5, r * 2, 3);
    ctx.fillStyle = "#f3ead7";
    ctx.fillRect(px - r, py - r - 5, r * 2 * Math.max(0, enemy.hp / enemy.maxHp), 3);
  }
  ctx.restore();
}

function drawBolt(ctx, ox, oy, cell, bolt) {
  const t = 1 - bolt.age / bolt.life;
  ctx.save();
  ctx.globalAlpha = Math.max(0, t);
  ctx.strokeStyle = bolt.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ox + (bolt.from.x + 0.5) * cell, oy + (bolt.from.y + 0.5) * cell);
  ctx.lineTo(ox + (bolt.to.x + 0.5) * cell, oy + (bolt.to.y + 0.5) * cell);
  ctx.stroke();
  ctx.restore();
}

function drawText(ctx, ox, oy, cell, text) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - text.age / text.life);
  ctx.fillStyle = text.color;
  ctx.font = `700 ${Math.max(11, cell * 0.42)}px "PingFang SC", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.text, ox + (text.x + 0.5) * cell, oy + (text.y + 0.2) * cell - text.age * cell * 0.4);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  if (!(w > 0) || !(h > 0)) return;
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
