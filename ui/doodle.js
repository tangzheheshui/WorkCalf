// 涂鸦风渲染器：白身 + 粗黑描边 + 透明背景 + 工位（桌面/键盘/鼠标）。
// 参考「趴工位」梗图：视角能看到键鼠，按键会在键盘上实时高亮。
// 接口与 placeholder.js 相同：render(dt, params) + hitTest(x, y)
//   params: { state, intensity, headX, headY, clickAge, keyAge, lastKey, speed, onKnock }
//
// 本文件只负责身体、工位、姿态和特效，不认识任何具体物种：
// 头部长什么样由 style.character 指向的角色模块（characters/*.js）决定。

import * as kit from './draw-kit.js';
import { getCharacter } from './characters/index.js';

const { TAU, lerp, blobPath, rrectPath } = kit;

// 本地薄包装：把当前配色里的描边/身体色补上，调用处保持简洁
const fillInk = (ctx, fill, lw) => kit.fillInk(ctx, fill, lw, C.ink);
const blob = (ctx, x, y, rx, ry, rot, seed, fill, lw) => kit.blob(ctx, x, y, rx, ry, rot, seed, fill, lw, C.ink);
const inkTube = (ctx, draw, width, lw) => kit.inkTube(ctx, draw, width, lw, C.ink, C.body);

/** 敲木鱼一拍的抬锤曲线：抬起 → 顶端停顿 → 快速砸下 → 休息 */
function muyuLift(p) {
  if (p < 0.20) return Math.sin((p / 0.20) * (Math.PI / 2));
  if (p < 0.26) return 1;
  if (p < 0.32) return Math.max(0, 1 - (p - 0.26) / 0.06);
  return 0;
}

/** 偷瞄：约每 6.5 秒睁眼往旁边瞟一次，持续 1.3 秒
 *  睁眼要快（约 0.1 秒“唰”地睁开），停一下，再慢慢闭上 */
function muyuGlance(t) {
  const period = 6.5;
  const ph = (t % period) / period;
  const start = 0.50;
  const end = 0.70;
  if (ph < start || ph > end) return 0;
  const k = (ph - start) / (end - start);
  if (k < 0.08) return k / 0.08;
  if (k > 0.78) return (1 - k) / 0.22;
  return 1;
}

/** 每次偷瞄左右轮换，让它看起来是在瞄人而不是发呆 */
function muyuGlanceSide(t) {
  return Math.floor(t / 6.5) % 2 === 0 ? -1 : 1;
}

const DEFAULT_STYLE = {
  bg: '#123fd0',
  ink: '#111111',
  body: '#ffffff',
  desk: '#fbfaf6',
  pad: '#c9c8c3',
  mouse: '#8f8b82',
  kbBody: '#8e8c85',
  kbSide: '#6d6b64',
  kbFace: '#d9d7d0',
  kbInk: '#3d3d3d',        // 键盘外框：深灰，避免和键帽黑边糊成一片
  keyInk: 'rgba(60,60,60,0.55)', // 键帽边线：更淡更细
  keyText: '#2f2f2f',
  key: '#f3f2ed',
  keyPressed: '#5fe3ff',
  muyu: '#8f4a3a',
  smoke: 'rgba(255,255,255,0.7)',
  patch: false, // 奶牛斑（holstein）
};

let C = { ...DEFAULT_STYLE };
export function applyStyle(style) {
  C = { ...DEFAULT_STYLE, ...(style || {}) };
}

// 键盘布局：每行 [显示字符, 键宽(单位)]，单位宽度由整行铺满键盘面
// 含编辑键/修饰键/方向键，按 Delete、Backspace、Enter 等也会亮
// 12 个单位宽：键少一点、键帽大一圈，数字/字母才看得清
const KB_LAYOUT = [
  {
    stagger: 0,
    keys: [
      ['Esc', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1],
      ['6', 1], ['7', 1], ['8', 1], ['9', 1], ['0', 1], ['Bk', 1],
    ],
  },
  {
    stagger: 0,
    keys: [
      ['Tab', 1], ['Q', 1], ['W', 1], ['E', 1], ['R', 1], ['T', 1],
      ['Y', 1], ['U', 1], ['I', 1], ['O', 1], ['P', 1], ['Del', 1],
    ],
  },
  {
    stagger: 0.014,
    keys: [
      ['Cap', 1], ['A', 1], ['S', 1], ['D', 1], ['F', 1], ['G', 1],
      ['H', 1], ['J', 1], ['K', 1], ['L', 1], ['Ent', 2],
    ],
  },
  {
    stagger: 0.028,
    keys: [
      ['Sh', 1], ['Z', 1], ['X', 1], ['C', 1], ['V', 1], ['B', 1], ['N', 1], ['M', 1],
      [',', 0.75], ['.', 0.75], ['/', 0.75], ['Sh', 1.75],
    ],
  },
  {
    stagger: 0,
    keys: [
      ['Ct', 1], ['Al', 1], ['Spc', 6], ['Al', 1],
      ['←', 0.75], ['↓', 0.75], ['↑', 0.75], ['→', 0.75],
    ],
  },
];
const KB_UNIT = 0.93 / 12;
const KB_ROW_TOP = 0.075;
const KB_ROW_BOT = 0.985;

// 键盘梯形透视：u=横向 0..1，v=纵深 0..1（上远下近）
// 近端（靠观众）宽、远端（靠小牛）窄：键盘放在桌上，斜着朝小牛，
// 观众从右下方看到的是键盘的斜侧面，而不是正对着脸。
// 键盘平铺在桌面上（像参考图那样俯视），面积尽量大：
// 远边只比近边窄一点，不做夸张的立起来效果
const KB_TL = { x: 0.30, y: 0.684 };
const KB_TR = { x: 0.95, y: 0.684 };
const KB_BR = { x: 0.965, y: 0.947 };
// 左下角往里收一点：给鼠标垫让出位置，两者不重叠
const KB_BL = { x: 0.30, y: 0.947 };
function kbPt(u, v, w, h) {
  const lx = lerp(KB_TL.x, KB_BL.x, v) * w;
  const ly = lerp(KB_TL.y, KB_BL.y, v) * h;
  const rx = lerp(KB_TR.x, KB_BR.x, v) * w;
  const ry = lerp(KB_TR.y, KB_BR.y, v) * h;
  return [lerp(lx, rx, u), lerp(ly, ry, u)];
}

// 整块键盘的朝向：不正对镜头，而是斜着摆向小牛。
// 小牛在画面左上方 → 键盘左端抬高、右端压向桌面，远端指向小牛；
// 观众看到的是键盘被转过一个角度的斜侧面，不是正面。
// 镜头整体倾斜（右高左低）：小牛、桌子、键盘、鼠标垫作为一整幅画面一起转，
// 而不是只有桌子歪着。键盘/垫子本身在场景里是正的，跟着镜头一起斜。
const SCENE_ROT = -0.07;
const SCENE_PIVOT = { x: 0.5, y: 0.55 };

// 键盘在场景坐标里摆正，倾斜交给镜头
const KB_ROT = 0;
const KB_PIVOT = { x: 0.5, y: 0.85 };

// 鼠标垫放在键盘左下、靠近小牛座位的桌面上，和键盘错开；整块垫子都留在窗口内
const PAD = { x: 0.145, y: 0.79, w: 0.19, h: 0.21, rot: 0 };
const MOUSE_LOCAL = { x: 0, y: 0 };
// 木鱼在垫子上的位置：稍微靠垫子右上方，离小牛近一点
const FISH = { x: 0.175, y: 0.782 };

function kbWorld(x, y, w, h) {
  const px = w * KB_PIVOT.x;
  const py = h * KB_PIVOT.y;
  const dx = x - px;
  const dy = y - py;
  const cos = Math.cos(KB_ROT);
  const sin = Math.sin(KB_ROT);
  return [px + dx * cos - dy * sin, py + dx * sin + dy * cos];
}

/** 第 r 排第 i 个键在键盘面内的 u/v 范围 */
function keyRect(r, i) {
  const row = KB_LAYOUT[r];
  let u = 0.025 + row.stagger;
  for (let j = 0; j < i; j++) u += row.keys[j][1] * KB_UNIT;
  const kw = row.keys[i][1] * KB_UNIT;
  const rowH = (KB_ROW_BOT - KB_ROW_TOP) / KB_LAYOUT.length;
  const v0 = KB_ROW_TOP + r * rowH + rowH * 0.09;
  const v1 = KB_ROW_TOP + (r + 1) * rowH - rowH * 0.09;
  return [u + 0.005, v0, u + kw - 0.005, v1];
}

const KEY_LABELS = new Set();
for (const row of KB_LAYOUT) for (const k of row.keys) KEY_LABELS.add(k[0]);

/** 键帽四角（已按 180° 内容方向翻转）→ 世界坐标 */
function keyQuad(label, w, h) {
  for (let r = 0; r < KB_LAYOUT.length; r++) {
    const keys = KB_LAYOUT[r].keys;
    for (let i = 0; i < keys.length; i++) {
      if (keys[i][0] !== label) continue;
      const [u0, v0, u1, v1] = keyRect(r, i);
      const fu0 = 1 - u1, fu1 = 1 - u0, fv0 = 1 - v1, fv1 = 1 - v0;
      return [
        kbPt(fu0, fv0, w, h),
        kbPt(fu1, fv0, w, h),
        kbPt(fu1, fv1, w, h),
        kbPt(fu0, fv1, w, h),
      ].map(([x, y]) => {
        const [wx, wy] = kbWorld(x, y, w, h);
        return [wx, wy];
      });
    }
  }
  return null;
}

/** 键帽中心（未旋转的 u/v）→ 世界坐标 */
function keyWorld(label, w, h) {
  for (let r = 0; r < KB_LAYOUT.length; r++) {
    const keys = KB_LAYOUT[r].keys;
    for (let i = 0; i < keys.length; i++) {
      if (keys[i][0] !== label) continue;
      const [u0, v0, u1, v1] = keyRect(r, i);
      // 键位内容相对键盘转了 180°：键盘是朝着小牛的，空格排在小牛这一侧
      const [x, y] = kbPt(1 - (u0 + u1) / 2, 1 - (v0 + v1) / 2, w, h);
      return kbWorld(x, y, w, h);
    }
  }
  return null;
}

// ---------- 身体零件（基础图形见 draw-kit.js） ----------

function mitten(ctx, x, y, r, rot, lw, resting = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (resting) {
    // 搭在鼠标上的手：摊平、略宽，手指只在前缘露一点，不是攥拳
    blobPath(ctx, 0, 0, r * 1.24, r * 0.82, 0, 4.7);
    fillInk(ctx, C.body, lw);
    // 拇指在近侧，虚搭着鼠标
    blobPath(ctx, r * 0.92, r * 0.26, r * 0.40, r * 0.34, -0.3, 7.3);
    fillInk(ctx, C.body, lw);
    // 前缘两道浅指缝
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = lw * 0.5;
    ctx.lineCap = 'round';
    for (const i of [-0.45, 0.15]) {
      ctx.beginPath();
      ctx.moveTo(i * r * 1.28, r * 0.28);
      ctx.quadraticCurveTo(i * r * 1.12, r * 0.56, i * r * 0.92, r * 0.68);
      ctx.stroke();
    }
  } else {
    blobPath(ctx, 0, 0, r * 1.15, r * 0.95, 0, 4.7);
    fillInk(ctx, C.body, lw);
    // 拇指
    blobPath(ctx, -r * 0.92, r * 0.34, r * 0.48, r * 0.4, 0.35, 7.3);
    fillInk(ctx, C.body, lw);
    // 指缝
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = lw * 0.55;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * r * 0.34, r * 0.12);
      ctx.quadraticCurveTo(i * r * 0.3, r * 0.55, i * r * 0.26, r * 0.72);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export class DoodleRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.t = 0;
    this.w = 0;
    this.h = 0;
    this.lastBeat = -1;
    this.smoke = [];
    this.smokeTimer = 0;
    this.hand = null; // 右手当前位置（平滑跟随按下的键）
    this.handKey = null; // 右手当前对应的键
    this.prevKeyAge = 999; // 上一帧的 keyAge，用来识别“新的一次按键”
    this.tapT = 999; // 本次抬手的计时
    this.liftY = 0; // 抬手最高点的 y
    this.mousePos = { x: 0, y: 0 }; // 平滑后的鼠标垫内偏移（像素）
    this.mouseOffset = { x: 0, y: 0 }; // 左手/鼠标跟随真实鼠标的偏移
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const el = this.canvas.parentElement;
    this.w = el.clientWidth;
    this.h = el.clientHeight;
    this.canvas.width = Math.max(1, Math.round(this.w * dpr));
    this.canvas.height = Math.max(1, Math.round(this.h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** 近似命中：整个场景矩形（当前整窗热区，保留接口给将来的精细判断） */
  hitTest(x, y) {
    return x >= 0 && y >= 0 && x <= this.w && y <= this.h;
  }

  /** 鼠标在垫子内的相对位移（-1..1）→ 局部偏移；带一点平滑，但比重锤跟手 */
  computeMouseOffset(p, w, h, dt) {
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const tx = clamp(p.mouseX || 0) * w * 0.040;
    const ty = clamp(p.mouseY || 0) * h * 0.058;
    const k = 1 - Math.exp(-dt * 24);
    this.mousePos.x += (tx - this.mousePos.x) * k;
    this.mousePos.y += (ty - this.mousePos.y) * k;
    return { x: this.mousePos.x, y: this.mousePos.y };
  }

  /** 右手跟随最近按下的键：新键先高高抬起，再重重砸下去 */
  updateHand(dt, p, w, h, idle) {
    const pressed = !idle && p.keyAge >= 0 && p.keyAge < 1.2 ? p.lastKey : null;
    let tx = w * 0.635;
    let ty = h * 0.775;
    let onKey = false;
    if (pressed) {
      const pos = keyWorld(pressed, w, h);
      if (pos) {
        // 手指落在键帽上：稍微偏右上，让高亮的键从手下方露出来，
        // 同时靠近窗口底边的数字排也不会把手切掉
        const cos = Math.cos(KB_ROT);
        const sin = Math.sin(KB_ROT);
        const ox = w * 0.008;
        const oy = -h * 0.016;
        tx = pos[0] + ox * cos - oy * sin;
        ty = pos[1] + ox * sin + oy * cos;
        onKey = true;
      }
    }
    if (!this.hand) this.hand = { x: tx, y: ty };

    // 检测“新的一次按键”（换键，或同一个键又被按了一次）
    const isNew =
      onKey &&
      (p.lastKey !== this.handKey || p.keyAge < this.prevKeyAge - 0.04);

    if (isNew) {
      // 夸张的抬手：先把手甩到键帽上方一大截，悬停一下再砸下去
      this.tapT = 0;
      this.liftY = ty - h * 0.12;
      this.hand.y = this.liftY;
      this.hand.x += (tx - this.hand.x) * 0.3;
      this.handKey = p.lastKey;
    } else {
      this.tapT += dt;
    }
    this.prevKeyAge = p.keyAge;

    if (isNew || this.tapT < 0.055) {
      // 抬手的最高点停一停，看得出“抬起”
      this.hand.y = this.liftY;
    } else {
      // 砸下比横向移动快，落地有“啪”的感觉
      this.hand.y += (ty - this.hand.y) * (1 - Math.exp(-dt * 32));
    }
    this.hand.x += (tx - this.hand.x) * (1 - Math.exp(-dt * 20));
  }

  render(dt, p) {
    this.t += dt * p.speed;
    const { ctx, w, h } = this;
    if (!w) return;
    const u = w / 204;
    const t = this.t;
    const muyu = p.state === 'muyu';
    const daze = p.state === 'daze';
    const smoking = daze || muyu;

    // 背景留空：窗口本身是透明的，人物背后直接透出桌面，不再铺蓝底
    ctx.clearRect(0, 0, w, h);

    // 呼吸
    const breathe = Math.sin(t * 1.5) * 0.006;

    this.mouseOffset = this.computeMouseOffset(p, w, h, dt);
    this.updateHand(dt, p, w, h, muyu || daze);

    // 镜头整体倾斜：小牛、桌子、键盘、鼠标垫一起转，像照片斜着拍
    ctx.save();
    ctx.translate(w * SCENE_PIVOT.x, h * SCENE_PIVOT.y);
    ctx.rotate(SCENE_ROT);
    ctx.translate(-w * SCENE_PIVOT.x, -h * SCENE_PIVOT.y);

    this.drawBody(ctx, w, h, u, breathe);
    this.drawDesk(ctx, w, h, u);
    this.drawMouseArea(ctx, w, h, u, muyu);
    this.drawKeyboard(ctx, w, h, u, p);

    // 敲木鱼节拍 → 音效：每拍第 0.30 处落锤，和画面上的“砸下去”对齐
    if (muyu && t >= 0.30) {
      const strikeIdx = Math.floor((t - 0.30) / 1.1);
      if (strikeIdx !== this.lastBeat) {
        this.lastBeat = strikeIdx;
        if (typeof p.onKnock === 'function') p.onKnock();
      }
    } else {
      this.lastBeat = -1;
    }

    const pose = this.armPose(w, h, u, t, p, muyu, daze);
    this.drawArms(ctx, w, h, u, pose);
    this.drawKnockFx(ctx, w, h, u, t, muyu);
    this.drawKeyFlash(ctx, w, h, u, p, muyu || daze);
    this.drawHead(ctx, w, h, u, t, p, muyu, daze, breathe);
    this.drawOffKey(ctx, w, h, u, p, muyu || daze);

    if (smoking) this.drawSmoke(ctx, w, h, u, dt);

    ctx.restore();

    // 休息提醒气泡：画在场景旋转之外，文字保持水平
    if (p.restText) this.drawRestBubble(ctx, w, h, u, p.restText, p.restAge || 0, p.restDur || 6);
  }

  // ---------- 休息提醒气泡 ----------
  // 手绘纸片 + 朝下的小尾巴，淡入淡出；宽度不够时按字符换行（中英文都适用）
  drawRestBubble(ctx, w, h, u, text, age, dur) {
    const pad = 9 * u;
    const lh = 19 * u;
    const font = `600 ${13 * u}px "Microsoft YaHei", "PingFang SC", system-ui, sans-serif`;
    ctx.save();
    ctx.font = font;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    const maxW = w * 0.82;
    // 标点不放行首：放不下时让它跟着上一行走
    const NO_LINE_START = '，。、！？；：…—）」』》〉】,.;:!?)]}%';
    const lines = [];
    let cur = '';
    for (const ch of text) {
      const next = cur + ch;
      if (cur && ctx.measureText(next).width > maxW - pad * 2) {
        if (NO_LINE_START.includes(ch)) {
          cur = next;
        } else {
          lines.push(cur);
          cur = ch;
        }
      } else {
        cur = next;
      }
    }
    if (cur) lines.push(cur);

    const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const bw = Math.min(w * 0.92, textW + pad * 2);
    const bh = lines.length * lh + pad * 2 - 2 * u;
    const bx = (w - bw) / 2;
    const by = h * 0.035;

    // 弹出（带回弹）+ 淡入淡出 + 轻微上浮，保证一眼能注意到
    const pop = Math.min(1, age / 0.24);
    const back = 1 + 2.4 * Math.pow(pop - 1, 3) + 1.4 * Math.pow(pop - 1, 2);
    const scale = 0.82 + 0.18 * back;
    const ccx = w / 2;
    const ccy = by + bh / 2;
    ctx.translate(ccx, ccy);
    ctx.scale(scale, scale);
    ctx.translate(-ccx, -ccy);

    const alpha = Math.min(1, age / 0.18, Math.max(0, (dur - age) / 0.5));
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(0, (1 - Math.min(1, age / 0.18)) * 7 * u);

    // 暖色纸片 + 强调色描边 + 投影：从透明桌面上跳出来
    ctx.shadowColor = 'rgba(120, 50, 20, 0.30)';
    ctx.shadowBlur = 12 * u;
    ctx.shadowOffsetY = 4 * u;
    rrectPath(ctx, bx, by, bw, bh, 9 * u);
    ctx.fillStyle = '#fff5e6';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#b3543f';
    ctx.lineWidth = 2.6 * u;
    ctx.stroke();

    // 小尾巴：朝下指着小牛（他坐在画面中偏左）
    const tx = bx + bw * 0.34;
    ctx.beginPath();
    ctx.moveTo(tx - 7 * u, by + bh - 1);
    ctx.lineTo(tx + 1 * u, by + bh + 11 * u);
    ctx.lineTo(tx + 10 * u, by + bh - 1);
    ctx.closePath();
    ctx.fillStyle = '#fff5e6';
    ctx.fill();
    ctx.strokeStyle = '#b3543f';
    ctx.stroke();
    // 盖掉尾巴压住的纸片底边
    ctx.beginPath();
    ctx.moveTo(tx - 6 * u, by + bh - 1.5 * u);
    ctx.lineTo(tx + 9 * u, by + bh - 1.5 * u);
    ctx.strokeStyle = '#fff5e6';
    ctx.lineWidth = 2.6 * u;
    ctx.stroke();

    // 文案
    ctx.fillStyle = '#3d2318';
    lines.forEach((line, i) => ctx.fillText(line, bx + pad, by + pad + i * lh));
    ctx.restore();
  }

  // ---------- 身体 ----------
  drawBody(ctx, w, h, u, breathe) {
    blob(
      ctx,
      w * 0.47,
      h * 0.60 + breathe * h,
      w * 0.235,
      h * 0.15,
      -0.05,
      2.3,
      C.body,
      4.2 * u,
    );
  }

  // ---------- 桌面 ----------
  drawDesk(ctx, w, h, u) {
    // 桌面在场景里是平的，靠镜头整体倾斜（SCENE_ROT）让它斜过来；
    // 画得比窗口大一圈，倾斜后也不会露出透明边角
    ctx.beginPath();
    ctx.moveTo(-w * 0.30, h * 0.635);
    ctx.lineTo(w * 1.30, h * 0.635);
    ctx.lineTo(w * 1.30, h * 1.50);
    ctx.lineTo(-w * 0.30, h * 1.50);
    ctx.closePath();
    ctx.fillStyle = C.desk;
    ctx.fill();
    // 桌沿黑线
    ctx.beginPath();
    ctx.moveTo(-w * 0.30, h * 0.635);
    ctx.lineTo(w * 1.30, h * 0.635);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.4 * u;
    ctx.stroke();
  }

  // ---------- 鼠标 / 木鱼 ----------
  drawMouseArea(ctx, w, h, u, muyu) {
    ctx.save();
    ctx.translate(w * PAD.x, h * PAD.y);
    ctx.rotate(PAD.rot);
    // 鼠标垫
    rrectPath(ctx, -w * PAD.w / 2, -h * PAD.h / 2, w * PAD.w, h * PAD.h, 8 * u);
    ctx.fillStyle = C.pad;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.4 * u;
    ctx.stroke();

    if (muyu) {
      // 木鱼：比鼠标大一圈，锤头刚好落在它上面
      // 当前坐标系已平移到鼠标垫中心，这里用相对垫子中心的偏移
      const mx = w * (FISH.x - PAD.x);
      const my = h * (FISH.y - PAD.y);
      blobPath(ctx, mx, my, w * 0.068, h * 0.050, 0.08, 6.1);
      fillInk(ctx, C.muyu, 3.2 * u);
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2.0 * u;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mx - w * 0.045, my - h * 0.009);
      ctx.quadraticCurveTo(mx, my + h * 0.011, mx + w * 0.047, my - h * 0.005);
      ctx.stroke();
      // 敲击口的一点高光
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.4 * u;
      ctx.beginPath();
      ctx.moveTo(mx - w * 0.029, my - h * 0.027);
      ctx.quadraticCurveTo(mx - w * 0.036, my - h * 0.016, mx - w * 0.030, my - h * 0.003);
      ctx.stroke();
    } else {
      // 鼠标：跟着真实鼠标在垫子上滑动
      const mx = this.mouseOffset.x;
      const my = this.mouseOffset.y;
      const cx = w * MOUSE_LOCAL.x + mx;
      const cy = h * MOUSE_LOCAL.y + my;
      // 鼠标画大、画深一点，手掌只压住后半部，前半部（按键）露出来
      blobPath(ctx, cx, cy, w * 0.066, h * 0.054, -0.12, 9.2);
      fillInk(ctx, C.mouse, 2.8 * u);
      // 鼠标线：从鼠标尾部拖到垫子上，手挡住鼠标时也能认出这是鼠标
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.6 * u;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy - h * 0.054);
      ctx.quadraticCurveTo(cx - w * 0.005, cy - h * 0.077, cx - w * 0.036, cy - h * 0.092);
      ctx.stroke();
      // 按键分缝：露在掌心外面的那一截
      ctx.beginPath();
      ctx.moveTo(cx + w * 0.002, cy + h * 0.024);
      ctx.lineTo(cx + w * 0.005, cy + h * 0.052);
      ctx.stroke();
      // 滚轮
      ctx.beginPath();
      ctx.moveTo(cx, cy - h * 0.030);
      ctx.lineTo(cx, cy - h * 0.014);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- 键盘（梯形透视 + 按键高亮） ----------
  drawKeyboard(ctx, w, h, u, p) {
    ctx.save();
    // 整块键盘斜向小牛，不再正对镜头
    ctx.translate(w * KB_PIVOT.x, h * KB_PIVOT.y);
    ctx.rotate(KB_ROT);
    ctx.translate(-w * KB_PIVOT.x, -h * KB_PIVOT.y);

    const quad = (a, b, c, d) => {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.closePath();
    };

    // 键盘厚度（近端侧壁）
    ctx.save();
    ctx.translate(0, h * 0.022);
    quad(
      kbPt(0, 0, w, h),
      kbPt(1, 0, w, h),
      kbPt(1, 1, w, h),
      kbPt(0, 1, w, h),
    );
    ctx.fillStyle = C.kbSide;
    ctx.fill();
    ctx.strokeStyle = C.kbInk;
    ctx.lineWidth = 1.8 * u;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();

    // 外壳
    quad(
      kbPt(0, 0, w, h),
      kbPt(1, 0, w, h),
      kbPt(1, 1, w, h),
      kbPt(0, 1, w, h),
    );
    ctx.fillStyle = C.kbBody;
    ctx.fill();
    ctx.strokeStyle = C.kbInk;
    ctx.lineWidth = 1.8 * u;
    ctx.lineJoin = 'round';
    ctx.stroke();

    quad(
      kbPt(0.015, 0.03, w, h),
      kbPt(0.99, 0.03, w, h),
      kbPt(0.99, 0.99, w, h),
      kbPt(0.015, 0.99, w, h),
    );
    ctx.fillStyle = C.kbFace;
    ctx.fill();

    const pressed = p.keyAge >= 0 && p.keyAge < 0.35 ? p.lastKey : null;

    // 5 排完整键盘：数字/字母/编辑键/空格/方向键
    for (let r = 0; r < KB_LAYOUT.length; r++) {
      const keys = KB_LAYOUT[r].keys;
      for (let i = 0; i < keys.length; i++) {
        const [u0, v0, u1, v1] = keyRect(r, i);
        this.drawKey(ctx, w, h, u, u0, v0, u1, v1, keys[i][0], keys[i][0] === pressed);
      }
    }

    ctx.restore();
  }

  drawKey(ctx, w, h, u, u0, v0, u1, v1, label, pressed) {
    // 键位内容整体转 180°：键盘正面朝着小牛，文字也是给小牛看的
    const fu0 = 1 - u1;
    const fu1 = 1 - u0;
    const fv0 = 1 - v1;
    const fv1 = 1 - v0;
    const a = kbPt(fu0, fv0, w, h);
    const b = kbPt(fu1, fv0, w, h);
    const c = kbPt(fu1, fv1, w, h);
    const d = kbPt(fu0, fv1, w, h);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.lineTo(d[0], d[1]);
    ctx.closePath();
    ctx.fillStyle = pressed ? C.keyPressed : C.key;
    ctx.fill();
    ctx.strokeStyle = C.keyInk;
    ctx.lineWidth = 0.6 * u;
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (label) {
      const cx = (a[0] + c[0]) / 2;
      const cy = (a[1] + c[1]) / 2;
      // 键帽的实际宽高（透视后）：字必须完整落在键帽里面，不能压到边线
      const kw = (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - d[0], c[1] - d[1])) / 2;
      const kh = (Math.hypot(d[0] - a[0], d[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1])) / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI);
      ctx.fillStyle = C.keyText;
      // 先按键帽高度定字号，再用实测文本宽度回缩，保证四边都留白
      let fs = Math.max(3.4 * u, Math.min(8.5 * u, kh * 0.60));
      ctx.font = `500 ${fs}px "Microsoft YaHei", "PingFang SC", sans-serif`;
      const maxW = kw * 0.80;
      const tw = ctx.measureText(label).width;
      if (tw > maxW) {
        fs = Math.max(3.4 * u, (fs * maxW) / tw);
        ctx.font = `500 ${fs}px "Microsoft YaHei", "PingFang SC", sans-serif`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }

  /** 按下的键在手上再盖一层半透明高亮：手挡住键帽时也看得到“这个键被按了” */
  drawKeyFlash(ctx, w, h, u, p, idle) {
    if (idle || !p.lastKey) return;
    if (!(p.keyAge >= 0 && p.keyAge < 0.45)) return;
    const quad = keyQuad(p.lastKey, w, h);
    if (!quad) return;
    const k = 1 - Math.min(1, p.keyAge / 0.45);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(quad[0][0], quad[0][1]);
    ctx.lineTo(quad[1][0], quad[1][1]);
    ctx.lineTo(quad[2][0], quad[2][1]);
    ctx.lineTo(quad[3][0], quad[3][1]);
    ctx.closePath();
    ctx.globalAlpha = 0.7 * k;
    ctx.fillStyle = C.keyPressed;
    ctx.fill();
    ctx.globalAlpha = 1 * k;
    ctx.strokeStyle = C.keyPressed;
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();
    ctx.restore();
  }

  /** 键盘上没有的键（F1..F12、Insert/Home 等）：手上方浮一个小键帽，保证有反馈 */
  drawOffKey(ctx, w, h, u, p, idle) {
    if (idle || !p.lastKey || KEY_LABELS.has(p.lastKey)) return;
    if (!(p.keyAge >= 0 && p.keyAge < 0.55)) return;
    const age = p.keyAge;
    const pop = Math.min(1, age / 0.08);
    const alpha = age < 0.35 ? 1 : Math.max(0, 1 - (age - 0.35) / 0.2);
    const x = this.hand ? this.hand.x : w * 0.635;
    const y = (this.hand ? this.hand.y : h * 0.775) - h * 0.11;
    const bw = w * 0.095 + (p.lastKey.length - 1) * w * 0.026;
    const bh = h * 0.06;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(-0.12);
    ctx.scale(pop, pop);
    rrectPath(ctx, -bw / 2, -bh / 2, bw, bh, 4 * u);
    ctx.fillStyle = age < 0.35 ? C.keyPressed : C.key;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.font = `600 ${7 * u}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.lastKey, 0, 0);
    ctx.restore();
  }

  // ---------- 手臂 / 手 ----------
  armPose(w, h, u, t, p, muyu, daze) {
    // 鼠标点击：按在鼠标上的那只手轻轻往下按一下；
    // 另一只（键盘上的）手不跟着动，否则没敲键盘手却在动会很怪
    const clickPress =
      p.clickAge >= 0 && p.clickAge < 0.28
        ? Math.sin((p.clickAge / 0.28) * Math.PI) * 4 * u
        : 0;

    // 敲木鱼：每 1.1s 一下（慢速时按动画速度放慢）：
    // 抬起 → 顶端短暂停顿 → 快速砸下 → 停一会儿，动作幅度做大才看得清
    const beat = muyu ? (t / 1.1) % 1 : 0;
    const lift = muyu ? muyuLift(beat) * h * 0.052 : 0;

    // 砸键瞬间的下压（配合大幅抬手，强调“抬起—按下”）
    const dip = p.keyAge >= 0 && p.keyAge < 0.1 ? 3.4 * u : 0;

    // 左手跟着画出来的鼠标走（鼠标垫有 PAD.rot 倾角）
    const lx = w * MOUSE_LOCAL.x + this.mouseOffset.x;
    const ly = h * MOUSE_LOCAL.y + this.mouseOffset.y;
    const mouseX = w * PAD.x + lx * Math.cos(PAD.rot) - ly * Math.sin(PAD.rot);
    const mouseY = h * PAD.y + lx * Math.sin(PAD.rot) + ly * Math.cos(PAD.rot);

    return {
      right: {
        x: this.hand ? this.hand.x : w * 0.635,
        y: (this.hand ? this.hand.y : h * 0.775) + dip,
        rot: -0.35,
      },
      // 敲木鱼时手抬到木鱼右上方，胳膊短、不横穿过木鱼
      left: muyu
        ? { x: w * 0.275, y: h * 0.705 - lift, rot: 0.18 }
        : {
            // 爪子搭在鼠标后半部，前半部（按键）露在手掌下面
            x: mouseX + w * 0.008,
            y: mouseY - h * 0.030 + clickPress,
            rot: 0.50,
          },
      // 握锤的手画小一点，避免把木鱼和锤头遮住
      handR: muyu ? w * 0.038 : w * 0.042,
      muyu,
      lift,
      beat,
    };
  }

  drawArms(ctx, w, h, u, pose) {
    const lw = 3.2 * u;

    // 左臂
    const lsx = w * 0.32;
    const lsy = h * 0.555;
    inkTube(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(lsx, lsy);
        if (pose.muyu) {
          // 手肘朝外弯，小臂收在木鱼右侧，不再长长地压在木鱼上
          ctx.quadraticCurveTo(w * 0.322, h * 0.646, pose.left.x, pose.left.y);
        } else {
          ctx.quadraticCurveTo(
            (lsx + pose.left.x) / 2 - w * 0.06,
            (lsy + pose.left.y) / 2 + h * 0.02,
            pose.left.x,
            pose.left.y,
          );
        }
      },
      w * 0.048,
      lw,
    );
    // 右臂：肘部朝外，跟着手走的键位自然摆
    const rsx = w * 0.60;
    const rsy = h * 0.555;
    inkTube(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(rsx, rsy);
        ctx.quadraticCurveTo(
          (rsx + pose.right.x) / 2 + w * 0.09,
          (rsy + pose.right.y) / 2 - h * 0.01,
          pose.right.x,
          pose.right.y,
        );
      },
      w * 0.048,
      lw,
    );

    // 木槌：握在左手，锤头落在木鱼上方；抬锤时连手一起抬高、锤身立起来
    if (pose.muyu) {
      const k = Math.min(1, Math.max(0, pose.lift / (h * 0.052)));
      // 静止时锤头落在木鱼上方；抬锤时绕手腕转起来，锤头高高扬起
      const base = Math.atan2(h * 0.737 - h * 0.705, w * 0.175 - w * 0.275);
      const angle = base + 0.85 * k;
      const len = Math.hypot(w * 0.100, h * 0.032);
      this.drawMallet(ctx, pose.left.x, pose.left.y, angle, len, w, h, u);
    }

    // 鼠标手是摊开搭着的，键盘手仍然是握拳敲键
    mitten(ctx, pose.left.x, pose.left.y, pose.handR, pose.left.rot, lw, !pose.muyu);
    mitten(ctx, pose.right.x, pose.right.y, pose.handR, pose.right.rot, lw);
  }

  /** 木槌：木头手柄 + 圆角锤头（锤头垂直于手柄） */
  drawMallet(ctx, px, py, angle, len, w, h, u) {
    const hx = px + Math.cos(angle) * len;
    const hy = py + Math.sin(angle) * len;

    ctx.lineCap = 'round';
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3.0 * u;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.strokeStyle = '#c99a5b';
    ctx.lineWidth = 1.6 * u;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(hx, hy);
    ctx.stroke();

    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle + Math.PI / 2);
    const bw = w * 0.056;
    const bh = h * 0.034;
    rrectPath(ctx, -bw / 2, -bh / 2, bw, bh, 3.2 * u);
    fillInk(ctx, '#c99a5b', 2.6 * u);
    // 锤头上一道木纹，让它是“木锤”而不是一块砖
    ctx.strokeStyle = 'rgba(90,60,30,0.55)';
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(-bw * 0.28, -bh * 0.05);
    ctx.quadraticCurveTo(0, bh * 0.14, bw * 0.28, -bh * 0.05);
    ctx.stroke();
    ctx.restore();
  }

  /** 落锤瞬间：木鱼上方爆出几道短促的敲击线 */
  drawKnockFx(ctx, w, h, u, t, muyu) {
    if (!muyu) return;
    const ph = (t / 1.1) % 1;
    if (ph < 0.30 || ph > 0.48) return;
    const k = 1 - (ph - 0.30) / 0.18;
    const cx = w * 0.175;
    const cy = h * 0.735;
    ctx.save();
    ctx.globalAlpha = 0.85 * k;
    ctx.strokeStyle = C.ink;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.4 * u;
    for (const a of [-2.75, -2.35, -1.95, -1.55]) {
      const r0 = w * (0.016 + 0.010 * (1 - k));
      const r1 = r0 + w * 0.030 * k + w * 0.010;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- 头部 / 脸 ----------
  // 头摆在哪儿、多大由身体姿态决定；头长什么样完全交给角色模块（characters/*.js）。
  drawHead(ctx, w, h, u, t, p, muyu, daze, breathe) {
    const hx = w * 0.44 + p.headX * w * 0.012;
    // 敲木鱼时头略微低下来看木鱼，但不能压住手腕，否则胳膊全被脸挡住
    const hy = h * (muyu ? 0.470 : 0.345) + p.headY * h * 0.008 + breathe * h;
    const rot = (muyu ? 0.30 : -0.03) + p.headX * 0.05 + (daze ? 0.05 : 0);
    const rx = w * 0.212;
    const ry = h * 0.200;

    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(rot);

    // 偷瞄节拍由核心算好再传给角色：角色只管怎么画
    const glance = muyu ? muyuGlance(t) : 0;
    const glanceSide = muyu ? muyuGlanceSide(t) : 0;

    const { smokeTip } = getCharacter(C.character).drawHead({
      ctx, w, h, u, t, p, rx, ry, muyu, daze, breathe, glance, glanceSide, C,
    }) || {};

    // 烟头局部坐标 → 世界坐标（供烟雾粒子发射）
    if (smokeTip) {
      const { x: lx, y: ly } = smokeTip;
      this.smokeTip = {
        x: hx + lx * Math.cos(rot) - ly * Math.sin(rot),
        y: hy + lx * Math.sin(rot) + ly * Math.cos(rot),
      };
    }

    ctx.restore();
  }

  // ---------- 烟 ----------
  drawSmoke(ctx, w, h, u, dt) {
    if (!this.smokeTip) return;
    const tipX = this.smokeTip.x;
    const tipY = this.smokeTip.y;

    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.22;
      this.smoke.push({
        x: tipX + (Math.random() - 0.5) * 4 * u,
        y: tipY,
        r: (1.6 + Math.random() * 1.2) * u,
        life: 1.7,
        max: 1.7,
        vx: (Math.random() - 0.5) * 28 * u,
        vy: -30 * u,
      });
    }
    for (const s of this.smoke) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.r += dt * 7 * u;
    }
    this.smoke = this.smoke.filter((s) => s.life > 0);

    for (const s of this.smoke) {
      const a = Math.max(0, s.life / s.max) * 0.55;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.fill();
    }
  }
}

// ---------- 模型头像（设置面板的预览卡片用） ----------
// 只负责画布尺寸/缩放，头像本身由角色模块画。
export function drawPortrait(canvas, style) {
  const st = { ...DEFAULT_STYLE, ...(style || {}) };
  const dpr = window.devicePixelRatio || 1;
  const S = 96;
  canvas.width = S * dpr;
  canvas.height = S * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const keep = C;
  C = st;
  getCharacter(st.character).drawPortrait({
    ctx,
    cx: S * 0.5,
    cy: S * 0.55,
    S,
    u: S / 96,
    C: st,
  });
  C = keep;
}
