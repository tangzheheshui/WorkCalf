// 闲牛主逻辑：事件订阅 → 动画参数 → 渲染器 / 音效
// 渲染器接口：render(dt, params) + hitTest(x, y)，占位实现与将来 Live2D 实现同构。

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

import { PlaceholderRenderer, applyStyle } from './placeholder.js';
import { SoundKit } from './sounds.js';
import { getModel, nextModelId } from './models.js';

const SPEEDS = { slow: 0.8, normal: 1, fast: 1.25 };

const canvas = document.getElementById('pet');
const stage = document.getElementById('stage');
const menu = document.getElementById('ctxmenu');

let cfg = await invoke('get_config');
invoke('debug_log', { msg: `cfg loaded, debug_dump=${cfg.debug_dump}` });
const sound = new SoundKit(() => cfg.sound_enabled);
const renderer = new PlaceholderRenderer(canvas);
applyStyle(getModel(cfg.model_id).style);
invoke('debug_log', { msg: 'renderer created, model=' + cfg.model_id });

let state = 'busy';
let typing = [];        // 最近按键时间戳 → 敲击强度
let intensity = 0;      // 平滑后的敲击强度 0..1
let head = { x: 0, y: 0, tx: 0, ty: 0 }; // 头部朝向（跟随鼠标）
let clickAt = -1e9;     // 左键点击时刻（点蹄动画）
let hot = false;        // 当前逐像素命中结果

await listen('pet://state', (e) => { state = e.payload.state; });
await listen('pet://key', () => { typing.push(performance.now()); sound.typing(); });
await listen('pet://click', () => { clickAt = performance.now(); });
await listen('pet://mouse', (e) => {
  const { rx, ry, inside } = e.payload;
  head.tx = rx;
  head.ty = ry;
  hitTest(inside);
});
await listen('pet://config', (e) => {
  cfg = e.payload;
  applyStyle(getModel(cfg.model_id).style);
  syncMenu();
});
await listen('pet://listener-error', (e) => console.warn('[闲牛]', e.payload.message));

/** 逐像素命中测试：光标在非透明像素上才允许鼠标落在小牛窗口 */
function hitTest(inside) {
  if (cfg.click_through) return; // 用户开启穿透：后端已固定 ignore
  let want = false;
  if (inside) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const px = (head.tx * 0.5 + 0.5) * w;
    const py = (head.ty * 0.5 + 0.5) * h;
    want = renderer.hitTest(px, py);
  }
  if (want !== hot) {
    hot = want;
    invoke('set_shaped_ignore', { hot });
  }
}

function syncMenu() {
  document.getElementById('mi-sound').textContent = `音效：${cfg.sound_enabled ? '开' : '关'}`;
}
syncMenu();

// 调试：定期导出渲染帧 + 状态机快照（config.json 中 debug_dump=true 时启用）
if (cfg.debug_dump) {
  setInterval(async () => {
    try {
      await invoke('debug_dump', { dataUrl: canvas.toDataURL('image/png') });
    } catch (e) {
      console.warn('[闲牛] dump 失败', e);
    }
  }, 3000);
}

// ---------- 右键菜单 ----------
stage.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  menu.classList.remove('hidden');
  menu.style.left = Math.min(e.clientX, window.innerWidth - 150) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 180) + 'px';
});
document.addEventListener('mousedown', (e) => {
  if (!menu.contains(e.target)) menu.classList.add('hidden');
});
document.getElementById('mi-sound').onclick = async () => {
  cfg = await invoke('toggle_sound');
  syncMenu();
};
document.getElementById('mi-model').onclick = async () => {
  cfg = await invoke('set_config', { patch: { model_id: nextModelId(cfg.model_id) } });
  syncMenu();
};
document.getElementById('mi-settings').onclick = () => {
  menu.classList.add('hidden');
  invoke('open_settings');
};
document.getElementById('mi-reset').onclick = () => {
  menu.classList.add('hidden');
  invoke('reset_position');
};
document.getElementById('mi-quit').onclick = () => invoke('quit_app');

// ---------- 主循环 ----------
let last = performance.now();
let lastDraw = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // 敲击强度：600ms 窗口内的按键数
  const cutoff = now - 600;
  while (typing.length && typing[0] < cutoff) typing.shift();
  const target = Math.min(1, typing.length / 10);
  intensity += (target - intensity) * Math.min(1, dt * 8);

  // 头部缓动跟随鼠标
  head.x += (head.tx - head.x) * Math.min(1, dt * 10);
  head.y += (head.ty - head.y) * Math.min(1, dt * 10);

  // 性能：忙碌态 60fps，发呆/木鱼态降到 ~30fps
  const busy = state === 'busy';
  if (busy || now - lastDraw >= 33) {
    lastDraw = now;
    renderer.render(dt, {
      state,
      intensity,
      headX: head.x,
      headY: head.y,
      clickAge: (now - clickAt) / 1000,
      speed: SPEEDS[cfg.anim_speed] || 1,
      onKnock: () => sound.muyu(),
    });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
