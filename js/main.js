import { BUILD_ORDER } from "./config.js";
import { equippedGems, loadProfile } from "./storage.js";
import { createRenderer } from "./render.js";
import { Game } from "./sim.js";
import { createUi } from "./ui.js";

const canvas = document.getElementById("board");
const game = new Game();
const renderer = createRenderer(canvas);
const profile = loadProfile();
const view = { tool: null, rotated: false, hover: null, selectedId: null };

const ui = createUi({
  game,
  view,
  profile,
  onStart: startRun,
});

function startRun() {
  view.tool = "gun";
  view.rotated = false;
  view.hover = null;
  view.selectedId = null;
  game.resetRun({
    hero: profile.hero,
    weapon: profile.weapon,
    gems: equippedGems(profile),
  });
  ui.show("play");
}

canvas.addEventListener("pointermove", (event) => {
  view.hover = renderer.cellFromEvent(event);
});
canvas.addEventListener("pointerleave", () => {
  view.hover = null;
});
canvas.addEventListener("pointerdown", (event) => {
  if (game.phase !== "plan" && game.phase !== "combat") return;
  const cell = renderer.cellFromEvent(event);
  if (!cell) return;
  const [x, y] = cell;
  const occ = game.cellAt(x, y);
  if (!view.tool || (occ && occ !== "core")) {
    view.selectedId = occ && occ !== "core" ? occ : null;
    if (occ && occ !== "core") view.tool = null;
    return;
  }
  const result = game.place(view.tool, x, y, view.rotated);
  if (!result.ok) game.toast(result.reason);
});

window.addEventListener("keydown", (event) => {
  const index = "1234567".indexOf(event.key);
  if (index >= 0 && (game.phase === "plan" || game.phase === "combat")) {
    view.selectedId = null;
    view.tool = BUILD_ORDER[index];
    return;
  }
  if (event.key === "r" || event.key === "R") view.rotated = !view.rotated;
  if (event.key === "Escape") {
    view.selectedId = null;
    view.tool = null;
  }
  if (event.key === "q" || event.key === "Q") {
    const result = game.castUlt();
    if (!result.ok && result.reason) game.toast(result.reason);
  }
  if (event.code === "Space" && game.phase === "plan") {
    event.preventDefault();
    game.beginWave();
  }
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    game.update(dt);
    renderer.draw(game, view);
    ui.sync();
  } catch (error) {
    console.error(error);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
