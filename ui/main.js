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

// ---------- 休息提醒 ----------
// 键盘按键 + 鼠标左键都算一次输入；累计到 rest_interval 就提醒一次。
// 计数由 Rust 侧落盘到 config.json（add_usage），重启不丢。
// 提示用牛自己的口吻自嘲，带提醒/建议的语气但不用「建议」二字；陈述用叹号、追问用问号。
const REST_LINES = [
  [
    '该歇五分钟了吧？',
    '先喘口气再敲！',
    '蹄子都冒烟了，停一下怎么了？',
    '先吃口草再干活！',
    '我是不是也该放个风了？',
  ],
  [
    '该给我加把草了吧？',
    '牛马也得讲点尊严！',
    '蹄子磨穿了，连工伤都不算吗？',
    '现在就想原地卧倒！',
    '谁问过这头牛累不累？',
  ],
  [
    '该把牛命也当命了吧？',
    '总得留点反刍的工夫！',
    '换头牛试试，看它撑不撑得住？',
    '心疼一下这头没人疼的牛吧！',
    '这五分钟，我先撂挑子行不行？',
  ],
];
const REST_SHOW_MS = 5000;

let usage = Number(cfg.usage_count) || 0;
let usagePending = 0;
let usageFlushTimer = 0;
let restInterval = Math.max(100, Number(cfg.rest_interval) || 1000);
let restTier = Math.floor(usage / restInterval); // 已经提醒过的档位
let rest = { text: '', at: 0, until: 0 };
let lastRestLine = '';

function flushUsage() {
  usageFlushTimer = 0;
  if (!usagePending || !window.__TAURI__) return;
  const delta = usagePending;
  usagePending = 0;
  invoke('add_usage', { delta }).catch((e) => {
    usagePending += delta; // 失败下次再一起刷
    console.warn('[勤劳的牛牛] 计数落盘失败', e);
  });
}

function countUsage() {
  usage += 1;
  usagePending += 1;
  if (!usageFlushTimer) usageFlushTimer = setTimeout(flushUsage, 3000);
  if (!cfg.rest_reminder) return;
  const tier = Math.floor(usage / restInterval);
  if (tier > restTier) {
    restTier = tier;
    showRest();
  }
}

function pickRestLine() {
  // 提醒次数越多，文案越损；同一档里随机，且不连着重复上一句
  const tier = Math.min(REST_LINES.length - 1, Math.floor(Math.max(0, restTier - 1) / 4));
  const pool = REST_LINES[tier].filter((s) => s !== lastRestLine);
  const line = pool[Math.floor(Math.random() * pool.length)] || REST_LINES[tier][0];
  lastRestLine = line;
  return line;
}

function showRest() {
  rest.text = pickRestLine();
  rest.at = performance.now();
  rest.until = rest.at + REST_SHOW_MS;
  sound.restAlert(); // 与打字声明显不同的两声提示
  invoke('nudge_window').catch(() => {}); // 小窗口左右戳几下，保证能注意到
}
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
  countUsage();
});
await listen('pet://click', () => {
  clickAt = performance.now();
  countUsage();
});
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
  // 改间隔/开关后，按当前累计重新对齐档位，避免积压的提醒立刻弹出
  restInterval = Math.max(100, Number(cfg.rest_interval) || 1000);
  restTier = Math.floor(usage / restInterval);
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

// 左键点一下小牛/气泡：提前收起休息提醒（点击穿透时靠 5 秒自动收起）
stage.addEventListener('mousedown', (e) => {
  if (e.button === 0) rest.until = 0;
});

// ---------- 右键 ----------
// 小牛本体右键不弹菜单（设置/退出走系统托盘）；仅屏蔽浏览器默认菜单
stage.addEventListener('contextmenu', (e) => e.preventDefault());

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

  // 休息提醒期间：停下手里的活，坐回去敲木鱼，头顶冒气泡
  const restActive = now < rest.until;
  const shownState = restActive ? 'muyu' : state;

  // 性能：忙碌态 60fps，发呆/木鱼态降到 ~30fps
  const busy = shownState === 'busy';
  if (busy || now - lastDraw >= 33) {
    lastDraw = now;
    renderer.render(dt, {
      state: shownState,
      restText: restActive ? rest.text : null,
      restAge: restActive ? (now - rest.at) / 1000 : 0,
      restDur: REST_SHOW_MS / 1000,
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
