// 柴犬：趴在工位上、一脸得意的打工柴。
//
// 与白牛牛同一套角色接口（见 characters/cow.js 顶部说明）：
// 核心负责身体、工位和姿态，这里只画头部与设置面板头像。
// 配色全部走 style，换色不用改绘制代码。

import { TAU, blobPath, cigarette } from '../draw-kit.js';

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
 */
function shibaEar(ctx, C, side, w, h, u, tipY, head) {
  // 耳尖用一个大圆角收口，别收成猫耳那种尖
  const innerBase = [side * w * 0.046, -h * 0.134];
  const innerCtrl = [side * w * 0.072, -h * 0.198];
  const tipIn = [side * w * 0.094, tipY + h * 0.030];
  const tipCtrl = [side * w * 0.122, tipY - h * 0.004];
  const tipOut = [side * w * 0.152, tipY + h * 0.018];
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
  ctx.quadraticCurveTo(side * w * 0.086, -h * 0.188, side * w * 0.102, tipY + h * 0.052);
  ctx.quadraticCurveTo(side * w * 0.122, tipY + h * 0.024, side * w * 0.144, tipY + h * 0.040);
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

/**
 * 五官：白口鼻、半眯的得意眼、黑鼻头、w 形嘴。
 * 头部和头像共用，保证两处长得一样。
 */
function shibaFace(ctx, C, w, h, u, o) {
  const { daze, muyu, glance, glanceSide, gazeX, gazeY, seed } = o;

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

  if (muyu && glance > 0.02) {
    // 偷瞄：眼睛拉成细缝，眼珠顶到一侧
    for (const sx of [-1, 1]) {
      const ry = h * (0.005 + 0.010 * glance);
      blobPath(ctx, sx * eyeX, eyeY, eyeRx * 1.02, ry, sx * 0.10, sx < 0 ? 3.1 : 4.7);
      ctx.fillStyle = C.muzzle;
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2.6 * u;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx * eyeX + glanceSide * w * 0.026 * glance, eyeY, w * 0.0105, 0, TAU);
      ctx.fillStyle = C.ink;
      ctx.fill();
    }
  } else if (muyu) {
    // 闭眼：两道放松的弧
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3.4 * u;
    ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * eyeX - w * 0.032, eyeY);
      ctx.quadraticCurveTo(sx * eyeX, eyeY + h * 0.026, sx * eyeX + w * 0.032, eyeY);
      ctx.stroke();
    }
  } else {
    // 睁眼：奶白眼白 + 黑眼珠，整块露出来（不再压眼皮，别像额头压住眼睛）
    const pupilR = w * 0.026;
    const maxOff = eyeRx - pupilR * 1.14;
    const offX = Math.max(-maxOff, Math.min(maxOff, gazeX + w * 0.010));
    const offY = Math.max(-eyeRy * 0.18, Math.min(eyeRy * 0.18, gazeY + h * 0.004));

    for (const sx of [-1, 1]) {
      eyeRectPath(ctx, sx * eyeX, eyeY, eyeRx, eyeRy, sx * 0.05, sx < 0 ? 3.1 : 4.7);
      ctx.fillStyle = C.muzzle;
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 3.2 * u;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sx * eyeX + offX, eyeY + offY, pupilR, 0, TAU);
      ctx.fillStyle = C.ink;
      ctx.fill();

      // 眼珠高光：一点就够，别做成大眼萌
      ctx.beginPath();
      ctx.arc(sx * eyeX + offX - w * 0.008, eyeY + offY - h * 0.012, w * 0.006, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
    }
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

  // 鼻子到嘴的连接线 + w 形嘴
  const my = h * 0.086;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2.8 * u;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, ny + h * 0.022);
  ctx.lineTo(0, my);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-w * 0.043, my);
  ctx.quadraticCurveTo(-w * 0.021, my + h * 0.018, 0, my);
  ctx.quadraticCurveTo(w * 0.021, my + h * 0.018, w * 0.043, my);
  ctx.stroke();

  // 下巴的小点
  ctx.beginPath();
  ctx.arc(0, my + h * 0.021, 1.2 * u, 0, TAU);
  ctx.fillStyle = C.ink;
  ctx.fill();

  // 右脸颊的三颗小点，照参考图点几笔
  for (const [dx, dy] of [[0.104, 0.076], [0.118, 0.090], [0.103, 0.102]]) {
    ctx.beginPath();
    ctx.arc(w * dx, h * dy, 1.4 * u, 0, TAU);
    ctx.fillStyle = C.ink;
    ctx.fill();
  }
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
  patch: false,
};

export default {
  id: 'shiba',
  name: '得意柴',
  desc: '趴在工位上、一脸“你懂的”',
  style: STYLE,

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

  drawHead({ ctx, w, h, u, p, rx, ry, muyu, daze, glance, glanceSide, C, headAt, body }) {
    const seed = 1.9;
    // 休息时耳朵压低一点：脑袋会往前倾，立耳太尖会蹭到上方的气泡
    const tipY = muyu ? -h * 0.215 : -h * 0.258;
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

    shibaEar(ctx, C, -1, w, h, u, tipY, head);
    shibaEar(ctx, C, 1, w, h, u, tipY, head);

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
      daze,
      muyu,
      glance,
      glanceSide,
      gazeX: p.headX * w * 0.014,
      gazeY: p.headY * h * 0.010,
      seed,
    });

    // 烟：和牛一样，只在休息/发呆时叼着
    let smokeTip = null;
    if (muyu || daze) {
      smokeTip = cigarette(ctx, w * 0.10, h * 0.076, w, h, u, C.ink);
    }
    ctx.restore();

    // 烟头换成放大后的坐标，核心后面只再套一层旋转
    if (smokeTip) smokeTip = { x: smokeTip.x * SX, y: smokeTip.y * SY };
    return { smokeTip };
  },

  drawPortrait({ ctx, cx, cy, S, u, C }) {
    // 和主画面用同一套头型/耳朵/五官，只是整体放大填满头像框
    const seed = 1.9;
    const K = 1.5;
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
    ctx.lineWidth = 3.8 * u;
    ctx.lineJoin = 'round';
    ctx.stroke(head);

    shibaEar(ctx, C, -1, S, S, u, tipY, head);
    shibaEar(ctx, C, 1, S, S, u, tipY, head);

    shibaFace(ctx, C, S, S, u, {
      daze: false,
      muyu: false,
      glance: 0,
      glanceSide: 0,
      gazeX: S * 0.004,
      gazeY: 0,
      seed,
    });
    ctx.restore();
  },
};
