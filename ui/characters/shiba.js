// 得意柴：趴在工位上、一脸得意的打工柴。
//
// 与白牛牛同一套角色接口（见 characters/cow.js 顶部说明）：
// 核心负责身体、工位和姿态，这里只画头部与设置面板头像。
// 配色全部走 style，换色不用改绘制代码。
//
// 除了 drawHead / drawPortrait，还实现了可选钩子 idleAction：
// 核心在每帧调用它，拿到头部额外偏移和表情状态，再转交给 drawHead。
// 动作完全由渲染时间 t 算出，不存内部状态，任意一帧都能独立渲染
//（预览页因此可以直接跳到某个动作中间截图）。

import { TAU, blobPath, blobShape } from '../draw-kit.js';

/** 二次贝塞尔取点 */
function quadPoint(p0, p1, p2, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
    y: mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
  };
}

/** 把二次贝塞尔按 t 切开，返回前半段的控制点和终点 */
function quadSplit(p0, p1, p2, t) {
  const q0 = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
  const q1 = [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
  return {
    q0,
    end: [q0[0] + (q1[0] - q0[0]) * t, q0[1] + (q1[1] - q0[1]) * t],
  };
}

/** 四角星：星星眼的高光 */
function star4(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + r * 0.20, y - r * 0.20, x + r, y);
  ctx.quadraticCurveTo(x + r * 0.20, y + r * 0.20, x, y + r);
  ctx.quadraticCurveTo(x - r * 0.20, y + r * 0.20, x - r, y);
  ctx.quadraticCurveTo(x - r * 0.20, y - r * 0.20, x, y - r);
  ctx.closePath();
  ctx.fill();
}

/** 桃心眼：底端一个尖、上面两个圆弧，r 约等于半宽 */
function heartPath(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.82);
  ctx.bezierCurveTo(x - r * 1.25, y - r * 0.20, x - r * 0.70, y - r * 1.15, x, y - r * 0.42);
  ctx.bezierCurveTo(x + r * 0.70, y - r * 1.15, x + r * 1.25, y - r * 0.20, x, y + r * 0.82);
  ctx.closePath();
}

// isPointInPath 只对路径套当前变换、不对测试点套，所以用一块恒等变换的画布来测
let probeCtx = null;
function pointInHead(head, x, y) {
  if (!probeCtx) probeCtx = document.createElement('canvas').getContext('2d');
  return probeCtx.isPointInPath(head, x, y);
}

/** 沿耳廓从耳尖往耳根走，找到它钻进脑袋里的那个点（t） */
function earCrossing(head, p0, p1, p2) {
  let lo = 0;
  let loIn = pointInHead(head, p0[0], p0[1]);
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    const hi = i / steps;
    const p = quadPoint(p0, p1, p2, hi);
    const inHead = pointInHead(head, p.x, p.y);
    if (inHead !== loIn) {
      let a = lo;
      let b = hi;
      for (let k = 0; k < 8; k++) {
        const mid = (a + b) / 2;
        const m = quadPoint(p0, p1, p2, mid);
        if (pointInHead(head, m.x, m.y) === loIn) a = mid;
        else b = mid;
      }
      return (a + b) / 2;
    }
    lo = hi;
    loIn = inHead;
  }
  return 1;
}

/**
 * 立耳：圆角三角，先画外耳再画内耳；side = -1 左 / 1 右。
 * 耳朵画在脑袋之后：填色盖掉脑袋的轮廓线，只描露在脑袋外面的那半圈，
 * 耳根和脑袋之间就不会横着一条黑线。
 *
 * tipDx：耳尖的横向偏移（抖耳朵用）。耳根不动，只把耳尖和它的控制点挪一点，
 * 内耳跟着挪，描边交点也重新算，所以耳根仍然严丝合缝。
 */
function shibaEar(ctx, C, side, w, h, u, tipY, head, tipDx = 0) {
  // 耳尖用一个大圆角收口，别收成猫耳那种尖
  const innerBase = [side * w * 0.046, -h * 0.134];
  const innerCtrl = [side * w * 0.072, -h * 0.198];
  const tipIn = [side * w * 0.094 + tipDx * 0.9, tipY + h * 0.030];
  const tipCtrl = [side * w * 0.122 + tipDx, tipY - h * 0.004];
  const tipOut = [side * w * 0.152 + tipDx * 0.8, tipY + h * 0.018];
  const outerCtrl = [side * w * 0.174, -h * 0.194];
  const outerBase = [side * w * 0.184, -h * 0.092];

  // 整只耳朵的填色（不描边）：把脑袋压在耳根处的轮廓线盖成肤色
  ctx.beginPath();
  ctx.moveTo(...innerBase);
  ctx.quadraticCurveTo(...innerCtrl, ...tipIn);
  ctx.quadraticCurveTo(...tipCtrl, ...tipOut);
  ctx.quadraticCurveTo(...outerCtrl, ...outerBase);
  ctx.quadraticCurveTo(side * w * 0.120, -h * 0.112, ...innerBase);
  ctx.closePath();
  ctx.fillStyle = C.body;
  ctx.fill();

  // 只描露在外面的耳朵轮廓：从两个交点绕耳尖一圈
  const tOut = earCrossing(head, tipOut, outerCtrl, outerBase);
  const tIn = earCrossing(head, tipIn, innerCtrl, innerBase);
  const outer = quadSplit(tipOut, outerCtrl, outerBase, tOut);
  const inner = quadSplit(tipIn, innerCtrl, innerBase, tIn);

  ctx.beginPath();
  ctx.moveTo(outer.end[0], outer.end[1]);
  ctx.quadraticCurveTo(outer.q0[0], outer.q0[1], tipOut[0], tipOut[1]);
  ctx.quadraticCurveTo(tipCtrl[0], tipCtrl[1], tipIn[0], tipIn[1]);
  ctx.quadraticCurveTo(inner.q0[0], inner.q0[1], inner.end[0], inner.end[1]);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 4.0 * u;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // 内耳：比外耳小一圈，颜色略深；裁在脑袋外面，别渗进头里
  ctx.save();
  const outside = new Path2D();
  outside.rect(-w * 2, -h * 2, w * 5, h * 5);
  outside.addPath(head);
  ctx.clip(outside, 'evenodd');

  ctx.beginPath();
  ctx.moveTo(side * w * 0.066, -h * 0.134);
  ctx.quadraticCurveTo(side * w * 0.086, -h * 0.188, side * w * 0.102 + tipDx * 0.75, tipY + h * 0.052);
  ctx.quadraticCurveTo(side * w * 0.122 + tipDx * 0.85, tipY + h * 0.024, side * w * 0.144 + tipDx * 0.75, tipY + h * 0.040);
  ctx.quadraticCurveTo(side * w * 0.164, -h * 0.180, side * w * 0.172, -h * 0.108);
  ctx.quadraticCurveTo(side * w * 0.120, -h * 0.118, side * w * 0.066, -h * 0.134);
  ctx.closePath();
  ctx.fillStyle = C.earInner;
  ctx.fill();
  ctx.restore();
}

/**
 * 梨形脑袋：腮帮子（sin≈0.45 的位置）鼓出来，头顶略收，
 * 这样脸胖在腮上，而不是把整颗头横向撑宽、把两只耳朵顶到两边。
 */
function shibaHeadShape(yOff, rx, ry, seed) {
  const p = new Path2D();
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const s = Math.sin(a);
    const c = Math.cos(a);
    const cheek =
      1 +
      0.085 * Math.exp(-Math.pow((s - 0.45) / 0.50, 2)) -
      0.03 * Math.max(0, -s) -
      // 太阳穴（眼梢外侧）稍微凹一点，剪影不是一圈平滑的蛋
      0.045 * Math.exp(-Math.pow((s + 0.15) / 0.16, 2));
    const k = 1 + Math.sin(a * 3 + seed) * 0.018 + Math.sin(a * 5 + seed * 1.7) * 0.012;
    const X = c * rx * cheek * k;
    const Y = yOff + s * ry * k;
    if (i === 0) p.moveTo(X, Y);
    else p.lineTo(X, Y);
  }
  p.closePath();
  return p;
}

/**
 * 手绘感圆角矩形：四角半径略有出入、边线微微鼓，别画成规整的 UI 控件。
 * 坐标以中心为原点，rot 只影响描出的形状，调用方的瞳孔/眼皮仍用原坐标。
 */
function eyeRectPath(ctx, x, y, rx, ry, rot, seed) {
  const jit = (k) => (Math.sin(seed * 91.7 + k * 37.3) * 0.5 + 0.5);
  const base = Math.min(rx, ry) * 0.90;
  const r0 = base * (0.88 + jit(1) * 0.24);
  const r1 = base * (0.88 + jit(2) * 0.24);
  const r2 = base * (0.88 + jit(3) * 0.24);
  const r3 = base * (0.88 + jit(4) * 0.24);
  const bow = ry * 0.05;
  const K = 0.5523; // 三次贝塞尔逼近四分之一圆

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(-rx + r0, -ry);
  ctx.quadraticCurveTo(0, -ry + bow, rx - r1, -ry);                       // 上边
  ctx.bezierCurveTo(rx - r1 + K * r1, -ry, rx, -ry + r1 - K * r1, rx, -ry + r1); // 右上角
  ctx.quadraticCurveTo(rx - rx * 0.02, 0, rx, ry - r2);                   // 右边
  ctx.bezierCurveTo(rx, ry - r2 + K * r2, rx - r2 + K * r2, ry, rx - r2, ry);    // 右下角
  ctx.quadraticCurveTo(0, ry - bow, -rx + r3, ry);                        // 下边
  ctx.bezierCurveTo(-rx + r3 - K * r3, ry, -rx, ry - r3 + K * r3, -rx, ry - r3); // 左下角
  ctx.quadraticCurveTo(-rx + rx * 0.02, 0, -rx, -ry + r0);                // 左边
  ctx.bezierCurveTo(-rx, -ry + r0 - K * r0, -rx + r0 - K * r0, -ry, -rx + r0, -ry); // 左上角
  ctx.closePath();
  ctx.restore();
}

// ---------- 闲置小动作 ----------
// 打字时不演；发呆时先愣一下，再按「每段空闲演一个」的节奏来。
// 演哪一个由核心给的 idleEpoch（第几次进入发呆）决定，所以每次停手看到的
// 小动作都不一样；顺序固定、不随机，预览页可以按序号直接截某一动作。
// 动作完全由 stateAge 推进，不存内部状态，任意一帧都能独立渲染。

const ACTIONS = [
  // 表情动作：face 里的参数由 shibaFace 统一应用并按 env 淡入淡出，
  // rot/dx/dy 是这一段的头部偏移（弧度 / 画面宽高比例）。
  { id: 'happy', label: '开心', dur: 1.6, side: 1, rot: 0.030, dy: -0.003,
    face: { eyes: 'happy', mouth: 'grin', open: 0.32, blush: 0.50 } },
  { id: 'laugh', label: '大笑', dur: 1.8, side: -1, rot: -0.035, dy: -0.007,
    face: { eyes: 'happy', mouth: 'grin', open: 1.0, blush: 0.60 } },
  { id: 'smug', label: '得意', dur: 1.8, side: 1 },
  { id: 'yawn', label: '困倦', dur: 2.5, side: 0 },
  { id: 'peek', label: '单眼偷瞄', dur: 2.0, side: 1 },
  { id: 'wink', label: '眨眼放电', dur: 1.4, side: -1 },
  { id: 'tongue', label: '吐舌卖萌', dur: 1.3, side: 1, rot: 0.050, dx: 0.006,
    face: { eyes: 'happy', mouth: 'tongue', blush: 0.50 } },
  { id: 'snicker', label: '偷笑', dur: 1.5, side: 1, rot: 0.060,
    face: { eyes: 'happy', mouth: 'smirk', blush: 0.60 } },
  { id: 'curious', label: '好奇歪头', dur: 1.8, side: -1, rot: -0.120, dx: -0.008, dy: 0.004,
    face: { eye: 'tall', ry: 0.95, shrink: 0.30, mouth: 'open', open: 0.22 } },
  { id: 'coquette', label: '撒娇', dur: 1.6, side: -1, rot: -0.060, dy: 0.004,
    face: { ry: 0.95, sparkle: 0.90, mouth: 'pout', blush: 0.60 } },
  { id: 'pout', label: '嘟嘴生气', dur: 1.6, side: 0, dy: 0.004,
    face: { brow: 'angry', browAmt: 0.90, ry: 0.60, mouth: 'pout', blush: 0.50 } },
  { id: 'surprise', label: '惊讶', dur: 1.5, side: 0, dy: -0.010,
    face: { eye: 'tall', brow: 'raise', browAmt: 1.0, shrink: 0.50, mouth: 'open', open: 0.45 } },
  { id: 'grimace', label: '做鬼脸', dur: 1.3, side: 1, rot: 0.060, dx: 0.006,
    face: { eyes: 'closedL', mouth: 'tongue', blush: 0.50, ps: -0.35 } },
  { id: 'hum', label: '哼歌', dur: 1.8, side: -1, rot: -0.040, dy: -0.004,
    face: { eyes: 'happy', mouth: 'open', open: 0.35, blush: 0.45 } },
  { id: 'lookAround', label: '东张西望', dur: 2.6, side: 0, previewAt: 0.25 },
  { id: 'earFlick', label: '抖耳朵', dur: 0.9, side: -1, previewAt: 0.125 },
];
const DAZE_LEAD = 0.7; // 停下后先愣一下再开始，免得一停手表情就跳出来

const smooth = (x) => {
  const q = Math.max(0, Math.min(1, x));
  return q * q * (3 - 2 * q);
};

/** 动作包络：起手和收手各留一段渐变，中间保持；免得表情生硬地跳出来 */
function bump(k, rise = 0.12, fall = 0.22) {
  if (k < rise) return smooth(k / rise);
  if (k > 1 - fall) return smooth((1 - k) / fall);
  return 1;
}

/** 每次眨眼约 0.13 秒，间隔 4.3 秒；返回 0..1（1 = 完全闭上） */
function blinkAt(t) {
  const period = 4.3;
  const ph = ((t % period) + period) % period;
  const d = 0.13;
  if (ph >= d) return 0;
  return Math.sin((ph / d) * Math.PI);
}

/**
 * 发呆时的小动作 → 头部偏移 + 表情状态。
 * stateAge 是进入发呆后经过的秒数；idleEpoch 是第几次进入发呆（核心维护）。
 * dx/dy 是相对画面宽高的比例，rot 是弧度，由核心加到头部变换上。
 */
function dazeAction(stateAge, idleEpoch) {
  const local = stateAge - DAZE_LEAD;
  if (local < 0) return null;
  const idx = ((idleEpoch % ACTIONS.length) + ACTIONS.length) % ACTIONS.length;
  const a = ACTIONS[idx];
  if (local >= a.dur) return null; // 这一段空闲的小动作已经演完
  const k = local / a.dur;
  const env = bump(k);
  let dx = 0;
  let dy = 0;
  let rot = 0;

  switch (a.id) {
    case 'peek':
      // 整颗脑袋偏过去偷看，眼神跟着脑袋走（不顶眼珠）
      rot = a.side * 0.115 * env;
      dx = a.side * 0.012 * env;
      dy = 0.004 * env;
      break;
    case 'smug':
      // 下巴抬起来、半眯眼、单边挑眉
      dy = -0.012 * env;
      rot = -0.030 * env;
      break;
    case 'earFlick':
      // 脑袋跟着耳朵轻轻一颤
      rot = Math.sin(k * Math.PI * 6) * 0.014 * env;
      break;
    case 'lookAround':
      // 先看左、再看右；脑袋和眼珠一起转
      rot = Math.sin(k * Math.PI * 2) * 0.140 * env;
      dx = Math.sin(k * Math.PI * 2) * 0.012 * env;
      break;
    case 'wink':
      rot = a.side * 0.030 * env;
      dy = -0.004 * env;
      break;
    case 'yawn':
      // 仰头张嘴，耳朵跟着往下塌
      dy = -0.018 * env;
      rot = -0.060 * env;
      break;
    default:
      // 纯表情动作：头部偏移直接写在动作上
      rot = (a.rot || 0) * env;
      dx = (a.dx || 0) * env;
      dy = (a.dy || 0) * env;
      break;
  }

  return { id: a.id, label: a.label, k, side: a.side, env, dx, dy, rot, face: a.face };
}

/** 敲木鱼：落锤时点一下头；偷瞄时整颗脑袋往偷看的方向偏一点 */
function muyuAction(t, glance, glanceSide) {
  const beat = (t / 1.1) % 1;
  const bob = Math.exp(-Math.pow((beat - 0.34) / 0.10, 2));
  const peek = Math.max(0, Math.min(1, glance));
  return {
    id: peek > 0.02 ? 'muyuPeek' : 'knock',
    k: beat,
    side: glanceSide,
    env: peek,
    bob,
    dx: glanceSide * 0.008 * peek,
    dy: 0.004 * bob,
    rot: 0.028 * bob + glanceSide * 0.045 * peek,
  };
}

/** 眉毛：只有做表情时才画，平时保持参考图那种干净的脸 */
function shibaBrow(ctx, C, w, h, u, eyeX, eyeY, eyeRy, sx, lift) {
  if (lift <= 0.02) return;
  const bx = sx * eyeX;
  const by = eyeY - eyeRy - h * 0.012;
  const inner = bx - sx * w * 0.016;
  const outer = bx + sx * w * 0.030;
  const rise = h * 0.016 * lift;
  ctx.beginPath();
  ctx.moveTo(inner, by + h * 0.003);
  ctx.quadraticCurveTo(bx, by - rise, outer, by - h * 0.002 + (1 - lift) * h * 0.004);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2.8 * u;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** 生气眉：眉头压低、眉尾挑高，左右对称 */
function shibaBrowAngry(ctx, C, w, h, u, eyeX, eyeY, eyeRy, sx, amt) {
  if (amt <= 0.02) return;
  const bx = sx * eyeX;
  const by = eyeY - eyeRy - h * 0.012;
  const inner = bx - sx * w * 0.021;
  const outer = bx + sx * w * 0.032;
  const down = h * 0.017 * amt;
  ctx.beginPath();
  ctx.moveTo(inner, by + down);
  ctx.quadraticCurveTo(bx, by + down * 0.15, outer, by - down * 0.5);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 3.0 * u;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/**
 * 五官：白口鼻、能换表情的眼睛、黑鼻头、w 形嘴。
 * 头部和头像共用，保证两处长得一样。
 * act 由 idleAction 给出；muyu/glance 时优先演敲木鱼那一套。
 */
function shibaFace(ctx, C, w, h, u, o) {
  const { muyu, busy, glance, glanceSide, gazeX, gazeY, seed, act, t, intensity } = o;

  // 白口鼻：铺满脸的下半张——上沿平、两腮圆角往下走，下沿顺着下巴收窄。
  // 形状取「收窄一圈的头型」∩「上沿以下」，所以中间最宽、往下顺着下巴收窄，不是椭圆；
  // 横向再收 10%，两边留一道黄毛，和参考图一样白色不顶到轮廓线。
  {
    const inset = shibaHeadShape(
      h * 0.004,
      w * 0.212 * 1.06 * 0.958 * 0.90,
      h * 0.200 * 0.99 * 0.955,
      seed,
    );
    // 上沿从中间往两边缓缓下坡，到腮帮最宽处切线正好竖直——
    // 和口鼻两侧的边界擦着接上，不会在两边冒出尖角
    const below = new Path2D();
    const bw = w * 0.208;
    below.moveTo(-bw, h * 0.30);
    below.lineTo(-bw, h * 0.046);
    below.bezierCurveTo(-w * 0.208, h * 0.018, -w * 0.150, h * 0.006, -w * 0.050, h * 0.006);
    below.quadraticCurveTo(0, h * 0.003, w * 0.050, h * 0.006);
    below.bezierCurveTo(w * 0.150, h * 0.006, w * 0.208, h * 0.018, bw, h * 0.046);
    below.lineTo(bw, h * 0.30);
    below.closePath();

    ctx.save();
    ctx.clip(inset);
    ctx.clip(below);
    ctx.fillStyle = C.muzzle;
    ctx.fillRect(-w * 0.5, -h * 0.3, w, h * 0.7);
    ctx.restore();
  }

  const eyeX = w * 0.088;
  const eyeY = -h * 0.022;
  const eyeRx = w * 0.056;
  const eyeRy = h * 0.034;
  const pupilR = w * 0.026;

  const blink = blinkAt(t || 0);
  const env = act ? act.env : 0;
  const side = act ? act.side : 0;

  // 表情参数：先决定怎么演，再统一画，避免每套表情各画一遍
  let mode = 'open'; // open | slit | closed | wink
  let modeL = null; // 单眼眯用：null = 跟随 mode
  let modeR = null;
  let eyeStyle = 'smallBead'; // 睁眼时的眼型，见 drawOpenEye（05 小豆豆眼）
  let slitAmt = 0;
  let ryScale = 1;
  let pupilShift = 0; // -1..1，乘以眼珠可移动范围
  let pupilLift = 0; // -1..1，乘以眼睛半高
  let pupilShrink = 0; // 0..1，瞳孔缩小（专心盯着一个地方）
  let sweat = 0; // 0..1，额角汗滴
  let sparkle = 0; // 0..1，眼里的星星高光
  let browL = 0; // 挑高眉（0..1）
  let browR = 0;
  let browStyle = 'raise'; // raise | angry（左右对称的情绪眉）
  let browAmt = 0;
  let mouth = 'w'; // w | smirk | flat | tight | open | grin | tongue | pout
  let mouthSide = 0;
  let openMouth = 0;
  let blush = 0;

  if (muyu) {
    if (glance > 0.02) {
      // 偷瞄：眼睛半睁、脑袋跟着偏过去（偏移在 muyuAction 里），嘴角一翘；
      // 不把眼珠顶到眼角（那是斜视），也不加眉毛
      ryScale = 1 - 0.45 * glance;
      mouth = 'smirk';
      mouthSide = glanceSide;
    } else {
      // 闭眼：两道放松的弧
      mode = 'closed';
    }
  } else if (act) {
    if (act.face) {
      // 表情动作：face 描述五官，所有幅度乘 env，入场/收场自然淡入淡出
      const v = act.face;
      const sd = act.side || 1;
      eyeStyle = v.eye || 'smallBead';
      ryScale = 1 - (1 - (v.ry ?? 1)) * env;
      pupilLift = (v.pl ?? 0) * env;
      pupilShift = (v.ps ?? 0) * env;
      pupilShrink = (v.shrink ?? 0) * env;
      slitAmt = (v.slit ?? 1) * env;
      if (v.eyes === 'wink') mode = 'wink';
      else if (v.eyes === 'slitL') { modeL = 'slit'; modeR = 'open'; }
      else if (v.eyes === 'slitR') { modeL = 'open'; modeR = 'slit'; }
      else if (v.eyes === 'closedL') { modeL = 'closed'; modeR = 'open'; }
      else if (v.eyes === 'closedR') { modeL = 'open'; modeR = 'closed'; }
      else if (v.eyes === 'happy') { modeL = 'happy'; modeR = 'happy'; }
      else if (v.eyes === 'closed') { modeL = 'closed'; modeR = 'closed'; }
      else if (v.eyes === 'slit') { modeL = 'slit'; modeR = 'slit'; }
      mouth = v.mouth || 'w';
      mouthSide = v.ms ?? sd;
      openMouth = (v.open ?? 0) * env;
      blush = (v.blush ?? 0) * env;
      sweat = (v.sweat ?? 0) * env;
      sparkle = (v.sparkle ?? 0) * env;
      if (v.brow === 'raise') {
        browL = browR = (v.browAmt ?? 1) * env;
      } else if (v.brow) {
        browStyle = v.brow;
        browAmt = (v.browAmt ?? 1) * env;
      }
      if (v.browL !== undefined) browL = v.browL * env;
      if (v.browR !== undefined) browR = v.browR * env;
    } else switch (act.id) {
      case 'peek': {
        // 偷瞄：整颗脑袋偏过去（偏移由 idleAction 给），一只眼眯成缝、另一只正常睁着，
        // 嘴角往偷看的那边一翘。靠「脑+眯眼+坏笑」演偷看，不把眼珠顶到眼角（那是斜视），
        // 也不画眉毛，免得两边眉一高一低看着怪。
        const sd = act.side || 1;
        modeL = sd > 0 ? 'slit' : 'open';
        modeR = sd < 0 ? 'slit' : 'open';
        slitAmt = act.env;
        ryScale = 1 - 0.10 * act.env;
        mouth = 'smirk';
        mouthSide = sd;
        break;
      }

      case 'smug':
        // 得意：半眯眼、下巴抬起、单边挑眉
        ryScale = 0.62;
        pupilLift = -0.25;
        browL = act.side < 0 ? act.env : 0.30 * act.env;
        browR = act.side > 0 ? act.env : 0.30 * act.env;
        mouth = 'smirk';
        mouthSide = act.side;
        break;
      case 'lookAround':
        pupilShift = Math.sin(act.k * Math.PI * 2);
        break;
      case 'wink':
        mode = 'wink';
        ryScale = 0.82;
        pupilShift = -0.35 * act.env;
        browL = act.side < 0 ? 0 : 0.85 * act.env;
        browR = act.side > 0 ? 0 : 0.85 * act.env;
        mouth = 'smirk';
        mouthSide = act.side;
        blush = 0.45 * act.env;
        break;
      case 'yawn':
        mode = 'closed';
        mouth = 'open';
        openMouth = act.env;
        break;
      case 'earFlick':
        // 耳朵在动，脸保持平常；顺带眨一下眼
        if (act.k > 0.22 && act.k < 0.34) mode = 'closed';
        break;
    }
  } else if (busy) {
    // 打字：不画眉毛，靠别的使劲——眼睛压窄、瞳孔缩小死盯键盘、嘴抿成一条直线，
    // 敲得够猛时额角再冒一滴汗。刚停手也留一点紧绷，不会一秒变回笑脸。
    const it = Math.max(0, Math.min(1, intensity || 0));
    const strain = 0.55 + 0.45 * it;
    ryScale = 1 - 0.34 * strain;
    pupilLift = 0.32 * strain;
    pupilShrink = 0.5 + 0.5 * it;
    sweat = Math.max(0, Math.min(1, (it - 0.25) / 0.75));
    mouth = 'tight';
    if (blink > 0.48) mode = 'closed';
    else if (blink > 0.02) ryScale *= 1 - blink * 0.85;
  } else if (blink > 0.48) {
    mode = 'closed';
  } else if (blink > 0.02) {
    ryScale = 1 - blink * 0.85;
  }

  // 腮红：只在卖萌/使坏的时候点一下
  if (blush > 0.01) {
    for (const sx of [-1, 1]) {
      blobPath(ctx, sx * w * 0.135, h * 0.030, w * 0.026, h * 0.011, 0, 4.2);
      ctx.fillStyle = `rgba(228, 120, 110, ${(0.22 * blush).toFixed(3)})`;
      ctx.fill();
    }
  }

  const drawOpenEye = (sx) => {
    const x0 = sx * eyeX;
    const y0 = eyeY;
    const ry = eyeRy * ryScale;
    const st = eyeStyle || 'almond';
    const basePr = Math.min(pupilR * (1 - 0.30 * pupilShrink), ry * 0.88);

    const paint = (lw = 3.2) => {
      ctx.fillStyle = C.muzzle;
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = lw * u;
      ctx.lineJoin = 'round';
      ctx.stroke();
    };

    /** 有机眼型：上下眼睑各一条贝塞尔；tilt 为正 = 外眼角向上 */
    const lens = (rx2, ry2, tilt, up = 1, low = 0.82) => {
      ctx.save();
      ctx.translate(x0, y0);
      ctx.rotate(-sx * tilt);
      ctx.beginPath();
      ctx.moveTo(-rx2, ry2 * 0.04);
      ctx.bezierCurveTo(-rx2 * 0.58, -ry2 * up, rx2 * 0.44, -ry2 * up * 1.06, rx2, -ry2 * 0.06);
      ctx.bezierCurveTo(rx2 * 0.58, ry2 * low, -rx2 * 0.52, ry2 * low * 1.04, -rx2, ry2 * 0.04);
      ctx.closePath();
      ctx.restore();
    };

    const pupil = (rx2, ry2, shape = 'round', mul = 1) => {
      const pr = Math.min(basePr * mul, ry2 * 0.92);
      const maxOff = Math.max(0, rx2 - pr * 1.12);
      const offX = Math.max(-maxOff, Math.min(maxOff, gazeX + w * 0.006 + pupilShift * maxOff));
      const offY = Math.max(-ry2 * 0.5, Math.min(ry2 * 0.5, gazeY + h * 0.004 + pupilLift * ry2 * 0.5));
      const cx2 = x0 + offX;
      const cy2 = y0 + offY;
      ctx.fillStyle = C.ink;
      if (shape === 'tall') {
        ctx.beginPath();
        ctx.ellipse(cx2, cy2, pr * 0.80, pr * 1.35, 0, 0, TAU);
        ctx.fill();
      } else if (shape === 'slit') {
        ctx.beginPath();
        ctx.ellipse(cx2, cy2, pr * 0.30, Math.min(ry2 * 0.95, pr * 1.55), 0, 0, TAU);
        ctx.fill();
      } else if (shape === 'heart') {
        heartPath(ctx, cx2, cy2, pr * 1.12);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(cx2, cy2, pr, 0, TAU);
        ctx.fill();
      }
      return [cx2, cy2, pr];
    };

    const glint = (cx2, cy2, pr, kind = 'dot') => {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      if (kind === 'star' || sparkle > 0.01) {
        const s = Math.max(sparkle, kind === 'star' ? 0.55 : 0);
        star4(ctx, cx2 - pr * 0.30, cy2 - pr * 0.40, pr * (0.50 + 0.24 * s));
        star4(ctx, cx2 + pr * 0.33, cy2 + pr * 0.25, pr * 0.22);
        return;
      }
      if (kind === 'double') {
        ctx.beginPath();
        ctx.arc(cx2 - pr * 0.30, cy2 - pr * 0.40, Math.max(w * 0.004, pr * 0.30), 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx2 + pr * 0.34, cy2 + pr * 0.26, Math.max(w * 0.003, pr * 0.14), 0, TAU);
        ctx.fill();
        return;
      }
      const r = kind === 'big' ? 0.36 : 0.22;
      ctx.beginPath();
      ctx.arc(cx2 - pr * 0.30, cy2 - pr * 0.40, Math.max(w * 0.004, pr * r), 0, TAU);
      ctx.fill();
    };

    // ---- 各种睁眼眼型（.preview/eye-sheet.html 里逐个挑） ----
    if (st === 'bead') {
      // 豆豆眼：几乎全黑的圆眼珠，只留一圈奶白
      ctx.beginPath();
      ctx.ellipse(x0, y0, eyeRx * 0.96, ry * 1.00, -sx * 0.04, 0, TAU);
      paint();
      ctx.save();
      ctx.clip();
      const [cx2, cy2, pr] = pupil(eyeRx * 0.96, ry, 'round', 1.25);
      glint(cx2, cy2, pr, 'big');
      ctx.restore();
      return;
    }
    if (st === 'round') {
      // 圆眼：眼白多、眼珠圆，双高光
      ctx.beginPath();
      ctx.ellipse(x0, y0, eyeRx * 1.03, ry * 1.12, -sx * 0.03, 0, TAU);
      paint();
      ctx.save();
      ctx.clip();
      const [cx2, cy2, pr] = pupil(eyeRx * 1.03, ry * 1.12, 'round', 1.0);
      glint(cx2, cy2, pr, 'double');
      ctx.restore();
      return;
    }
    if (st === 'upturn') {
      // 上挑眼：外眼角往上挑，坏笑的感觉
      lens(eyeRx, ry, 0.18, 1.00, 0.78);
      paint();
      ctx.save();
      ctx.clip();
      const [cx2, cy2, pr] = pupil(eyeRx, ry);
      glint(cx2, cy2, pr);
      ctx.restore();
      return;
    }
    if (st === 'puppy') {
      // 狗狗眼：外眼角下垂、眼珠大，一眼无辜
      lens(eyeRx * 1.03, ry * 1.02, -0.20, 1.08, 1.18);
      paint();
      ctx.save();
      ctx.clip();
      const [cx2, cy2, pr] = pupil(eyeRx * 1.03, ry * 1.02, 'round', 1.15);
      glint(cx2, cy2, pr, 'big');
      ctx.restore();
      return;
    }
    if (st === 'tall') {
      // 竖瞳眼：眼型高、眼珠竖长
      ctx.beginPath();
      ctx.ellipse(x0, y0, eyeRx * 0.90, ry * 1.32, -sx * 0.03, 0, TAU);
      paint();
      ctx.save();
      ctx.clip();
      const [cx2, cy2, pr] = pupil(eyeRx * 0.90, ry * 1.32, 'tall');
      glint(cx2, cy2, pr);
      ctx.restore();
      return;
    }
    if (st === 'cat') {
      // 猫眼：外眼角上挑 + 竖条瞳孔
      lens(eyeRx, ry, 0.16, 1.02, 0.72);
      paint();
      ctx.save();
      ctx.clip();
      const [cx2, cy2, pr] = pupil(eyeRx, ry, 'slit');
      glint(cx2, cy2, pr);
      ctx.restore();
      return;
    }
    if (st === 'double') {
      // 圆润眼型 + 两颗高光
      lens(eyeRx, ry, 0.03, 1.05, 1.00);
      paint();
      ctx.save();
      ctx.clip();
      const [cx2, cy2, pr] = pupil(eyeRx, ry);
      glint(cx2, cy2, pr, 'double');
      ctx.restore();
      return;
    }
    if (st === 'star') {
      // 星星眼：高光换成一大一小两颗星
      lens(eyeRx, ry, 0.03, 1.05, 1.00);
      paint();
      ctx.save();
      ctx.clip();
      const [cx2, cy2, pr] = pupil(eyeRx, ry);
      glint(cx2, cy2, pr, 'star');
      ctx.restore();
      return;
    }
    if (st === 'heart') {
      // 桃心眼：眼珠画成桃心
      lens(eyeRx, ry, 0.03, 1.05, 1.00);
      paint();
      ctx.save();
      ctx.clip();
      const [cx2, cy2, pr] = pupil(eyeRx, ry, 'heart', 0.95);
      glint(cx2, cy2, pr);
      ctx.restore();
      return;
    }
    if (st === 'smallBead') {
      // 小豆豆眼：整只眼缩小一圈，脸更憨
      const rx2 = eyeRx * 0.80;
      const ry2 = ry * 0.86;
      ctx.beginPath();
      ctx.ellipse(x0, y0, rx2, ry2, -sx * 0.04, 0, TAU);
      paint();
      ctx.save();
      ctx.clip();
      const [cx2, cy2, pr] = pupil(rx2, ry2, 'round', 1.30);
      glint(cx2, cy2, pr, 'big');
      ctx.restore();
      return;
    }
    if (st === 'wide') {
      // 圆睁眼：眼白撑大、眼珠缩小
      ctx.beginPath();
      ctx.ellipse(x0, y0, eyeRx * 1.04, ry * 1.24, -sx * 0.03, 0, TAU);
      paint();
      ctx.save();
      ctx.clip();
      const [cx2, cy2, pr] = pupil(eyeRx * 1.04, ry * 1.24, 'round', 0.62);
      glint(cx2, cy2, pr, 'double');
      ctx.restore();
      return;
    }
    if (st === 'sleepy') {
      // 半睡眼：厚上眼睑压下来，只露出下半截眼白和一颗小眼珠
      ctx.beginPath();
      ctx.ellipse(x0, y0, eyeRx * 0.98, ry * 1.00, -sx * 0.03, 0, TAU);
      paint();
      ctx.save();
      ctx.clip();
      const pr = Math.min(basePr * 0.55, ry * 0.42);
      const cx2 = x0 + gazeX + w * 0.006 + pupilShift * w * 0.012;
      const cy2 = y0 + ry * 0.30 + gazeY + pupilLift * ry * 0.2;
      ctx.beginPath();
      ctx.arc(cx2, cy2, pr, 0, TAU);
      ctx.fillStyle = C.ink;
      ctx.fill();
      glint(cx2, cy2, pr);
      ctx.fillStyle = C.body;
      ctx.beginPath();
      ctx.rect(x0 - eyeRx * 1.3, y0 - ry * 1.5, eyeRx * 2.6, ry * 1.50);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x0 - eyeRx * 1.0, y0 - ry * 0.06);
      ctx.quadraticCurveTo(x0, y0 + ry * 0.16, x0 + eyeRx * 1.0, y0 - ry * 0.12);
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 3.6 * u;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (st === 'lash') {
      // 睫毛眼：外眼角加两根短睫毛
      lens(eyeRx, ry, 0.10, 1.00, 0.84);
      paint();
      ctx.save();
      ctx.clip();
      const [cx2, cy2, pr] = pupil(eyeRx, ry);
      glint(cx2, cy2, pr);
      ctx.restore();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2.6 * u;
      ctx.lineCap = 'round';
      for (const [ox, oy, len] of [[0.42, -0.86, 0.008], [0.66, -0.74, 0.010], [0.86, -0.52, 0.008]]) {
        ctx.beginPath();
        ctx.moveTo(x0 + sx * eyeRx * ox, y0 + ry * oy);
        ctx.lineTo(x0 + sx * (eyeRx * ox + w * len), y0 + ry * oy - h * len * 1.5);
        ctx.stroke();
      }
      return;
    }

    // 默认：原来的杏仁眼（圆角矩形，作为对照保留）
    eyeRectPath(ctx, x0, y0, eyeRx, ry, sx * 0.05, sx < 0 ? 3.1 : 4.7);
    paint();
    const [cx2, cy2, pr] = pupil(eyeRx, ry);
    glint(cx2, cy2, pr);
  };

  const drawSlitEye = (sx) => {
    const ry = h * (0.005 + 0.011 * slitAmt);
    blobPath(ctx, sx * eyeX, eyeY, eyeRx * 1.02, ry, sx * 0.10, sx < 0 ? 3.1 : 4.7);
    ctx.fillStyle = C.muzzle;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.6 * u;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(sx * eyeX + pupilShift * w * 0.026 * slitAmt, eyeY, w * 0.0105, 0, TAU);
    ctx.fillStyle = C.ink;
    ctx.fill();
  };

  const drawClosedEye = (sx) => {
    ctx.beginPath();
    ctx.moveTo(sx * eyeX - w * 0.032, eyeY);
    ctx.quadraticCurveTo(sx * eyeX, eyeY + h * 0.026, sx * eyeX + w * 0.032, eyeY);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3.4 * u;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  /** 笑眼：向上弯的弧（∩），和闭眼那两道放松的弧反着来 */
  const drawHappyEye = (sx) => {
    ctx.beginPath();
    ctx.moveTo(sx * eyeX - w * 0.030, eyeY + h * 0.009);
    ctx.quadraticCurveTo(sx * eyeX, eyeY - h * 0.023, sx * eyeX + w * 0.030, eyeY + h * 0.009);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3.4 * u;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const drawEye = (sx) => {
    if (mode === 'wink') {
      if (sx === side) drawClosedEye(sx);
      else drawOpenEye(sx);
      return;
    }
    const m = (sx < 0 ? modeL : modeR) || mode;
    if (m === 'closed') drawClosedEye(sx);
    else if (m === 'happy') drawHappyEye(sx);
    else if (m === 'slit') drawSlitEye(sx);
    else drawOpenEye(sx);
  };
  for (const sx of [-1, 1]) drawEye(sx);

  // 眉毛：默认只挑一下；生气时左右对称压下来
  if (browStyle === 'angry') {
    shibaBrowAngry(ctx, C, w, h, u, eyeX, eyeY, eyeRy, -1, browAmt);
    shibaBrowAngry(ctx, C, w, h, u, eyeX, eyeY, eyeRy, 1, browAmt);
  } else {
    shibaBrow(ctx, C, w, h, u, eyeX, eyeY, eyeRy, -1, browL);
    shibaBrow(ctx, C, w, h, u, eyeX, eyeY, eyeRy, 1, browR);
  }

  // 黑鼻头 + 高光
  const ny = h * 0.040;
  ctx.beginPath();
  ctx.moveTo(-w * 0.037, ny - h * 0.007);
  ctx.quadraticCurveTo(0, ny - h * 0.024, w * 0.037, ny - h * 0.007);
  ctx.quadraticCurveTo(w * 0.035, ny + h * 0.014, 0, ny + h * 0.027);
  ctx.quadraticCurveTo(-w * 0.035, ny + h * 0.014, -w * 0.037, ny - h * 0.007);
  ctx.closePath();
  ctx.fillStyle = C.nose;
  ctx.fill();
  blobPath(ctx, -w * 0.010, ny - h * 0.002, w * 0.007, h * 0.004, -0.3, 8.8);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();

  // 鼻子到嘴的连接线
  const my = h * 0.086;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2.8 * u;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, ny + h * 0.022);
  ctx.lineTo(0, my);
  ctx.stroke();

  // 嘴：w 形 / 坏笑 / 张嘴 / 吐舌头
  if (mouth === 'open') {
    const orx = w * (0.018 + 0.016 * openMouth);
    const ory = h * (0.012 + 0.018 * openMouth);
    const mpath = blobShape(0, my + h * 0.010, orx, ory, 0, 7.1);
    ctx.fillStyle = C.mouth;
    ctx.fill(mpath);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.4 * u;
    ctx.stroke(mpath);
    ctx.save();
    ctx.clip(mpath);
    blobPath(ctx, 0, my + h * 0.010 + ory * 0.55, orx * 0.70, ory * 0.55, 0, 3.9);
    ctx.fillStyle = C.tongue;
    ctx.fill();
    ctx.restore();
  } else if (mouth === 'grin') {
    // 咧嘴笑：张开的嘴里露一排牙
    const gw = w * 0.040;
    const gh = h * (0.014 + 0.008 * openMouth);
    const gp = new Path2D();
    gp.moveTo(-gw, my);
    gp.quadraticCurveTo(0, my - h * 0.008, gw, my); // 上唇中间略上拱
    gp.quadraticCurveTo(gw * 0.85, my + gh, 0, my + gh); // 右半下缘
    gp.quadraticCurveTo(-gw * 0.85, my + gh, -gw, my); // 左半下缘
    gp.closePath();
    ctx.fillStyle = C.mouth;
    ctx.fill(gp);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.4 * u;
    ctx.stroke(gp);
    // 上排牙
    ctx.save();
    ctx.clip(gp);
    ctx.fillStyle = C.muzzle;
    ctx.fillRect(-gw, my - h * 0.005, gw * 2, gh * 0.48);
    ctx.restore();
  } else if (mouth === 'smirk') {
    const up = h * 0.011;
    const down = h * 0.004;
    ctx.beginPath();
    ctx.moveTo(-w * 0.043, my + (mouthSide < 0 ? -up : down));
    ctx.quadraticCurveTo(0, my + h * 0.011, w * 0.043, my + (mouthSide > 0 ? -up : down));
    ctx.stroke();
  } else if (mouth === 'tongue') {
    // 嘴角微张
    ctx.beginPath();
    ctx.moveTo(-w * 0.034, my + h * 0.003);
    ctx.quadraticCurveTo(0, my + h * 0.013, w * 0.034, my + h * 0.001);
    ctx.stroke();

    // 舌头从嘴角探出来
    const tx = mouthSide * w * 0.018;
    const tr = w * 0.014 * (0.35 + 0.65 * env);
    ctx.beginPath();
    ctx.moveTo(tx - tr * 0.85, my + h * 0.005);
    ctx.quadraticCurveTo(tx + tr * 1.15, my + h * 0.012, tx + tr * 0.75, my + h * 0.034);
    ctx.quadraticCurveTo(tx - tr * 0.15, my + h * 0.043, tx - tr * 0.85, my + h * 0.018);
    ctx.closePath();
    ctx.fillStyle = C.tongue;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();
    // 舌沟
    ctx.strokeStyle = 'rgba(140, 60, 60, 0.45)';
    ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    ctx.moveTo(tx, my + h * 0.014);
    ctx.quadraticCurveTo(tx + tr * 0.18, my + h * 0.026, tx, my + h * 0.034);
    ctx.stroke();
  } else if (mouth === 'pout') {
    // 嘟嘴：一小圆嘴，粉粉的
    const pr2 = w * 0.0115;
    const py = my + h * 0.007;
    ctx.beginPath();
    ctx.ellipse(0, py, pr2, pr2 * 0.8, 0, 0, TAU);
    ctx.fillStyle = C.tongue;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.0 * u;
    ctx.stroke();
  } else if (mouth === 'tight') {
    // 较劲时：短短一条线，中间微微往下压
    ctx.beginPath();
    ctx.moveTo(-w * 0.029, my + h * 0.001);
    ctx.quadraticCurveTo(0, my + h * 0.008, w * 0.029, my + h * 0.001);
    ctx.stroke();
  } else if (mouth === 'flat') {
    // 抿紧：一条几乎没有弧度的线
    ctx.beginPath();
    ctx.moveTo(-w * 0.034, my + h * 0.001);
    ctx.quadraticCurveTo(0, my + h * 0.003, w * 0.034, my + h * 0.001);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-w * 0.043, my);
    ctx.quadraticCurveTo(-w * 0.021, my + h * 0.018, 0, my);
    ctx.quadraticCurveTo(w * 0.021, my + h * 0.018, w * 0.043, my);
    ctx.stroke();
  }

  // 额角汗滴：打字够猛时才出现，替掉被去掉的眉毛，把“绷着”的感觉补上
  if (sweat > 0.02) {
    const sx = w * 0.196;
    const sy = -h * 0.072;
    const r = w * (0.006 + 0.006 * sweat);
    ctx.beginPath();
    ctx.moveTo(sx, sy - r * 1.9);
    ctx.bezierCurveTo(sx + r * 1.05, sy - r * 0.45, sx + r * 0.92, sy + r * 0.85, sx, sy + r * 0.85);
    ctx.bezierCurveTo(sx - r * 0.92, sy + r * 0.85, sx - r * 1.05, sy - r * 0.45, sx, sy - r * 1.9);
    ctx.closePath();
    ctx.fillStyle = '#9dd4f5';
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.8 * u;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // 下巴的小点
  ctx.beginPath();
  ctx.arc(0, my + h * 0.021, 1.2 * u, 0, TAU);
  ctx.fillStyle = C.ink;
  ctx.fill();
}

/** 场景坐标 → 脑袋局部坐标（核心先 translate 再 rotate，这里再反缩放） */
function sceneToLocal(x, y, headAt, SX, SY) {
  const dx = x - headAt.x;
  const dy = y - headAt.y;
  const cr = Math.cos(headAt.rot);
  const sr = Math.sin(headAt.rot);
  return [(dx * cr + dy * sr) / SX, (-dx * sr + dy * cr) / SY];
}

/** 核心画的身体，换算成脑袋局部坐标系的路径（用来判断哪段头轮廓压在身体上） */
function bodyInHeadFrame(w, h, headAt, body, SX, SY) {
  if (!headAt || !body) return null;
  const n = 40;
  const p = new Path2D();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + Math.sin(a * 3 + body.seed) * 0.02 + Math.sin(a * 5 + body.seed * 1.7) * 0.013;
    const px = Math.cos(a) * body.rx * k;
    const py = Math.sin(a) * body.ry * k;
    const X = body.x + px * Math.cos(body.rot) - py * Math.sin(body.rot);
    const Y = body.y + px * Math.sin(body.rot) + py * Math.cos(body.rot);
    const [lx, ly] = sceneToLocal(X, Y, headAt, SX, SY);
    if (i === 0) p.moveTo(lx, ly);
    else p.lineTo(lx, ly);
  }
  p.closePath();
  return p;
}

const STYLE = {
  body: '#eed79d',
  ink: '#111111',
  muzzle: '#fffdf6',
  earInner: '#dcb878',
  nose: '#141414',
  mouth: '#5b2b26',
  tongue: '#e88f8f',
  patch: false,
};

export default {
  id: 'shiba',
  name: '得意柴',
  desc: '趴在工位上、一脸“你懂的”',
  style: STYLE,

  // 预览页用：每个动作截一帧（stateAge 是动作摆幅最大的时刻，epoch 指定演哪个）
  preview: [
    { label: '打字紧绷', state: 'busy', t: 0.5 },
    ...ACTIONS.map((a, i) => ({
      label: a.label,
      state: 'daze',
      stateAge: DAZE_LEAD + a.dur * (a.previewAt ?? 0.5),
      epoch: i,
    })),
    { label: '敲木鱼', state: 'muyu', t: 0.33 },
    { label: '休息偷瞄', state: 'muyu', t: 3.9 },
  ],

  // 身体正面：脖子到胸口是奶白色，和口鼻的白连成一片。
  // 核心在画桌子、胳膊之前调用，所以白胸在胳膊后面、桌子上面被自然裁掉。
  drawBodyDetail(ctx, w, h, u, { breathe, body }) {
    if (!body) return;
    ctx.save();
    ctx.clip(body.path);
    blobPath(ctx, body.x, body.y - h * 0.010, w * 0.168, h * 0.150, body.rot, 5.4);
    ctx.fillStyle = STYLE.muzzle;
    ctx.fill();
    ctx.restore();
  },

  /**
   * 可选钩子：核心每帧调用，返回值里的 dx/dy（按宽高比例）和 rot（弧度）
   * 会叠加到头部变换上，act 原样传给 drawHead 用来画表情。
   */
  idleAction({ t, stateAge, idleEpoch, muyu, daze, glance, glanceSide }) {
    if (muyu) return muyuAction(t, glance || 0, glanceSide || 0);
    if (!daze) return null;
    return dazeAction(stateAge || 0, idleEpoch || 0);
  },

  drawHead({ ctx, w, h, u, p, rx, ry, muyu, daze, glance, glanceSide, C, headAt, body, t, act }) {
    const seed = 1.9;
    // 休息时耳朵压低一点：脑袋会往前倾，立耳太尖会蹭到上方的气泡
    let tipY = muyu ? -h * 0.215 : -h * 0.258;
    // 抖耳朵：耳尖左右摆；其它动作顺带改变耳朵高度（偷看时竖起、打哈欠时塌下）
    let flick = 0;
    if (act) {
      if (act.id === 'earFlick') flick = Math.sin(act.k * Math.PI * 6) * act.env;
      if (act.id === 'peek') tipY -= h * 0.012 * act.env;
      if (act.id === 'smug') tipY -= h * 0.008 * act.env;
      if (act.id === 'yawn') tipY += h * 0.035 * act.env;
      if (act.id === 'muyuPeek') tipY -= h * 0.010 * act.env;
    }
    // 打字时耳朵微微往后塌，敲得越猛越明显
    if (!muyu && !daze) {
      const it = Math.max(0, Math.min(1, p.intensity || 0));
      tipY += h * 0.008 * (0.4 + 0.6 * it);
    }
    const earDx = flick * w * 0.030;

    // 大头：整颗头在核心给的头型基础上放大一圈，脸才够憨
    const SX = 1.16;
    const SY = 1.08;
    ctx.save();
    ctx.scale(SX, SY);

    // 先画脑袋（腮部鼓、头顶收的梨形），再画耳朵盖住耳根处的轮廓线
    const head = shibaHeadShape(h * 0.004, rx * 1.06, ry * 0.99, seed);
    ctx.fillStyle = C.body;
    ctx.fill(head);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3.8 * u;
    ctx.lineJoin = 'round';
    ctx.stroke(head);

    shibaEar(ctx, C, -1, w, h, u, tipY, head, -earDx);
    shibaEar(ctx, C, 1, w, h, u, tipY, head, earDx);

    // 脖子：身体挡在头后面的那一段不画黑线——先用毛色压掉，头和身子连成一片；
    // 桌沿以下不算（那里是脑袋贴着桌子，轮廓线要留着）
    const bodyLocal = bodyInHeadFrame(w, h, headAt, body, SX, SY);
    if (bodyLocal && headAt) {
      const aboveDesk = new Path2D();
      const quad = [
        [headAt.x - w * 2, h * 0.635],
        [headAt.x + w * 2, h * 0.635],
        [headAt.x + w * 2, -h * 2],
        [headAt.x - w * 2, -h * 2],
      ];
      quad.forEach(([X, Y], i) => {
        const [lx, ly] = sceneToLocal(X, Y, headAt, SX, SY);
        if (i === 0) aboveDesk.moveTo(lx, ly);
        else aboveDesk.lineTo(lx, ly);
      });
      aboveDesk.closePath();

      ctx.save();
      ctx.clip(bodyLocal);
      ctx.clip(aboveDesk);
      ctx.strokeStyle = C.body;
      ctx.lineWidth = 5.6 * u;
      ctx.lineJoin = 'round';
      ctx.stroke(head);
      ctx.restore();

      // 下巴正中留一段白，把口鼻的白接到胸口的白（脖子两侧仍留黄毛）
      ctx.save();
      ctx.clip(bodyLocal);
      ctx.clip(aboveDesk);
      blobPath(ctx, 0, h * 0.205, w * 0.090, h * 0.040, 0, 7.3);
      ctx.fillStyle = C.muzzle;
      ctx.fill();
      ctx.restore();
    }

    shibaFace(ctx, C, w, h, u, {
      busy: !muyu && !daze,
      muyu,
      glance,
      glanceSide,
      gazeX: p.headX * w * 0.014,
      gazeY: p.headY * h * 0.010,
      seed,
      act,
      t,
      intensity: p.intensity,
    });

    // 得意柴不抽烟：不再画烟，也不返回 smokeTip
    ctx.restore();
  },

  drawPortrait({ ctx, cx, cy, S, u, C }) {
    // 和主画面用同一套头型/耳朵/五官，只是整体放大填满头像框。
    // 头像在 88px 的卡片里显示，放大 1.74 倍后线宽会跟着放大，
    // 所以这里用细一档的 u，别让黑线糊成一团。
    const seed = 1.9;
    const K = 1.5;
    const lw = u * 0.62;
    const tipY = -S * 0.258;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(K * 1.16, K * 1.08);

    const rx = S * 0.212;
    const ry = S * 0.200;
    const head = shibaHeadShape(S * 0.004, rx * 1.06, ry * 0.99, seed);
    ctx.fillStyle = C.body;
    ctx.fill(head);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3.8 * lw;
    ctx.lineJoin = 'round';
    ctx.stroke(head);

    shibaEar(ctx, C, -1, S, S, lw, tipY, head);
    shibaEar(ctx, C, 1, S, S, lw, tipY, head);

    shibaFace(ctx, C, S, S, lw, {
      daze: false,
      muyu: false,
      glance: 0,
      glanceSide: 0,
      gazeX: S * 0.004,
      gazeY: 0,
      seed,
      act: null,
      t: 0,
    });
    ctx.restore();
  },
};
