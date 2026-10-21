// 勤劳的牛牛主逻辑：事件订阅 → 动画参数 → 渲染器 / 音效
// 渲染器接口：render(dt, params) + hitTest(x, y)，占位实现与将来 Live2D 实现同构。

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

import { DoodleRenderer, applyStyle } from './doodle.js';
import { SoundKit } from './sounds.js';
import { getModel } from './models.js';

const SPEEDS = { slow: 0.8, normal: 1, fast: 1.25 };

const canvas = document.getElementById('pet');
const stage = document.getElementById('stage');
const menu = document.getElementById('ctxmenu');

let cfg = await invoke('get_config');
invoke('debug_log', { msg: `cfg loaded, debug_dump=${cfg.debug_dump}, opacity=${cfg.opacity}` });
const sound = new SoundKit(() => cfg.sound_enabled);
const renderer = new DoodleRenderer(canvas);
applyStyle(getModel(cfg.model_id).style);
invoke('debug_log', { msg: 'renderer created, model=' + cfg.model_id });

let state = 'busy';
let typing = [];        // 最近按键时间戳 → 敲击强度
let intensity = 0;      // 平滑后的敲击强度 0..1
let head = { x: 0, y: 0, tx: 0, ty: 0 }; // 头部朝向（跟随鼠标）
let clickAt = -1e9;     // 左键点击时刻（点蹄动画）
let lastKey = null;     // 最近按下的键（键盘高亮）
let lastKeyAt = -1e9;
// 鼠标在垫子内的相对位置（-1..1）：由真实鼠标的“位移”累积，而不是屏幕坐标
let mouseMove = { x: 0, y: 0 };
let lastMouseAt = -1e9;
let scaleReq = cfg.scale; // 滚轮缩放用：记录已经请求到的比例，避免连续滚动丢步
const applyOpacity = () => {
  canvas.style.opacity = String(cfg.opacity ?? 1);
};
applyOpacity();
const clamp1 = (v) => Math.max(-1, Math.min(1, v));

// rdev 键名 → 键盘上的短标签（与 doodle.js 的 KB_LAYOUT 对应）
const KEY_DISPLAY = {
  Space: 'Spc',
  Return: 'Ent', Enter: 'Ent', KpEnter: 'Ent',
  Backspace: 'Bk',
  Delete: 'Del',
  Tab: 'Tab',
  Escape: 'Esc',
  CapsLock: 'Cap',
  ShiftLeft: 'Sh', ShiftRight: 'Sh',
  ControlLeft: 'Ct', ControlRight: 'Ct',
  Alt: 'Al', AltGr: 'Al',
  MetaLeft: 'Win', MetaRight: 'Win',
  UpArrow: '↑', DownArrow: '↓', LeftArrow: '←', RightArrow: '→',
  Insert: 'Ins', Home: 'Home', End: 'End',
  PageUp: 'PgUp', PageDown: 'PgDn',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'",
  LeftBracket: '[', RightBracket: ']', BackSlash: '\\',
  Minus: '-', Equal: '=', BackQuote: '`',
  KpPlus: '+', KpMinus: '-', KpMultiply: '*', KpDivide: '/', KpDecimal: '.',
};

/** rdev 的键名 → 键盘上的标签；不认识的键返回 null */
function normalizeKey(raw) {
  if (!raw) return null;
  const mapped = KEY_DISPLAY[raw];
  if (mapped) return mapped;
  let m = /^Key([A-Z])$/.exec(raw);
  if (m) return m[1];
  m = /^Num([0-9])$/.exec(raw);
  if (m) return m[1];
  m = /^Kp([0-9])$/.exec(raw);
  if (m) return m[1];
  m = /^F([0-9]{1,2})$/.exec(raw);
  if (m) return raw; // F1..F12：键盘上没有，用手边浮键帽提示
  if (raw.length === 1) return raw.toUpperCase();
  return null;
}

await listen('pet://state', (e) => { state = e.payload.state; });
await listen('pet://key', (e) => {
  typing.push(performance.now());
  const k = normalizeKey(e.payload && e.payload.key);
  if (k) {
    lastKey = k;
    lastKeyAt = performance.now();
  }
  sound.typing();
});
await listen('pet://click', () => { clickAt = performance.now(); });
await listen('pet://mouse', (e) => {
  const { rx, ry, dx, dy } = e.payload || {};
  head.tx = rx || 0;
  head.ty = ry || 0;
  if (typeof dx === 'number' && typeof dy === 'number') {
    // 相对小牛的鼠标垫：只累积真实鼠标的位移，屏幕坐标不直接映射到垫子上。
    // 小牛面对面坐着，左右、上下都要按它自己的视角来（上下也和屏幕相反）。
    mouseMove.x = clamp1(mouseMove.x - dx / 620);
    mouseMove.y = clamp1(mouseMove.y - dy / 520);
    lastMouseAt = performance.now();
  }
});
await listen('pet://config', (e) => {
  cfg = e.payload;
  scaleReq = cfg.scale;
  applyOpacity();
  applyStyle(getModel(cfg.model_id).style);
});
await listen('pet://listener-error', (e) => console.warn('[勤劳的牛牛]', e.payload.message));


// 调试：定期导出渲染帧 + 状态机快照（config.json 中 debug_dump=true 时启用）
if (cfg.debug_dump) {
  setTimeout(() => {
    invoke('debug_log', {
      msg: 'computed canvas opacity=' + getComputedStyle(canvas).opacity,
    });
  }, 1500);
  setInterval(async () => {
    try {
      await invoke('debug_dump', { dataUrl: canvas.toDataURL('image/png') });
    } catch (e) {
      console.warn('[勤劳的牛牛] dump 失败', e);
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
document.getElementById('mi-settings').onclick = () => {
  menu.classList.add('hidden');
  invoke('open_settings');
};
document.getElementById('mi-quit').onclick = () => invoke('quit_app');

// ---------- 滚轮缩放 ----------
// 鼠标停在桌宠窗口上滚轮即可调整显示比例（0.3~2.0）；
// 每格 0.05，往下滚缩小、往上滚放大；窗口左上角位置不变。
// 滚动事件先攒 80ms 再发，避免连续滚动刷爆 IPC。
let wheelAccum = 0;
let wheelTimer = 0;
function applyWheelZoom() {
  wheelTimer = 0;
  const notches = Math.max(-3, Math.min(3, Math.round(wheelAccum / 100)));
  wheelAccum = 0;
  if (!notches) return;
  const next = Math.max(0.3, Math.min(2.0, Math.round((scaleReq - notches * 0.05) * 100) / 100));
  if (Math.abs(next - scaleReq) < 1e-6) return;
  scaleReq = next;
  cfg.scale = next;
  invoke('set_config', { patch: { scale: next } }).catch((err) => {
    console.warn('[勤劳的牛牛] 缩放失败', err);
  });
}
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  wheelAccum += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
  if (!wheelTimer) wheelTimer = setTimeout(applyWheelZoom, 80);
}, { passive: false });

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

  // 鼠标停下 1s 后，慢慢回到垫子正中间（默认位置）
  if (now - lastMouseAt > 1000) {
    const back = Math.min(1, dt * 2.2);
    mouseMove.x += (0 - mouseMove.x) * back;
    mouseMove.y += (0 - mouseMove.y) * back;
  }

  // 性能：忙碌态 60fps，发呆/木鱼态降到 ~30fps
  const busy = state === 'busy';
  if (busy || now - lastDraw >= 33) {
    lastDraw = now;
    renderer.render(dt, {
      state,
      intensity,
      headX: head.x,
      headY: head.y,
      mouseX: mouseMove.x,
      mouseY: mouseMove.y,
      clickAge: (now - clickAt) / 1000,
      keyAge: (now - lastKeyAt) / 1000,
      lastKey,
      speed: SPEEDS[cfg.anim_speed] || 1,
      onKnock: () => sound.muyu(),
    });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
