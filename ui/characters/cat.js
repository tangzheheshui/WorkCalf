// 小橘：线条风小猫，趴工位打工（形象按用户选的 05 号候选定稿）。
//
// 白猫 + 粗藏青描边 + 斗鸡眼（白眼圈黑眼珠往鼻子挤）+ 常驻腮红 +
// 浅棕小眉/三杠/胡须 + 宽扁胖脸。休息脸 = 斗鸡眼，表情换法：
//   开心=弧往上弯，闭眼=弧往下弯，得意=眯眼线，惊讶=瞪圆眼，生气=加两道黑眉。
// 与白牛牛/得意柴同一套角色接口（见 characters/cow.js 顶部说明）。
//
// 动作完全由渲染时间 t 算出，不存内部状态，任意一帧都能独立渲染
//（预览页因此可以直接跳到某个动作中间截图）。

import { TAU, blobShape, inkTube } from '../draw-kit.js';

// 配色全部走 style，换色不用改绘制代码。
// ink 换成藏青后整个场景（桌子/键盘/胳膊）一起变，和参考图的粗线一致。
const STYLE = {
  body: '#fefcf8', // 白猫
  lineTint: '#fefcf8',
  stripe: '#b8946a', // 头顶三杠、小眉毛（参考图的浅棕）
  nose: '#f2a0b5', // 粉鼻头
  whisker: '#b8946a',
  ink: '#1a1a2e', // 藏青粗描边
};

/**
 * 短圆耳：耳尖小圆弧收口，只比头顶高出一小截。
 * 先画耳再画头，耳根埋进脑袋里。tipDx 只挪耳尖（抖耳朵用）。
 */
function catEar(ctx, C, side, rx, ry, u, tipDx = 0) {
  const tint = C.lineTint || C.body;
  ctx.beginPath();
  ctx.moveTo(side * rx * 0.58, -ry * 0.68);
  ctx.quadraticCurveTo(side * rx * 0.67, -ry * 0.96, side * rx * 0.735 + tipDx, -ry * 1.12);
  ctx.quadraticCurveTo(side * rx * 0.82 + tipDx * 0.9, -ry * 1.16, side * rx * 0.88, -ry * 1.00);
  ctx.quadraticCurveTo(side * rx * 0.85, -ry * 0.82, side * rx * 0.86, -ry * 0.50);
  ctx.quadraticCurveTo(side * rx * 0.72, -ry * 0.44, side * rx * 0.58, -ry * 0.68);
  ctx.closePath();
  ctx.fillStyle = tint;
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 3.4 * u;
  ctx.lineJoin = 'round';
  ctx.stroke();
  // 内耳一道小弧
  ctx.beginPath();
  ctx.moveTo(side * rx * 0.68, -ry * 0.76);
  ctx.quadraticCurveTo(side * rx * 0.74 + tipDx * 0.7, -ry * 0.86, side * rx * 0.78 + tipDx * 0.7, -ry * 0.72);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2.6 * u;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** 眨眼约 0.13 秒，间隔 4.3 秒；返回 0..1（1 = 完全闭上） */
function blinkAt(t) {
  const period = 4.3;
  const ph = ((t % period) + period) % period;
  const d = 0.13;
  if (ph >= d) return 0;
  return Math.sin((ph / d) * Math.PI);
}

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

/**
 * 五官：斗鸡眼为基准（05 号候选），常驻腮红，表情换线的画法。
 * act 由 idleAction 给出；muyu/glance 时优先演敲木鱼那一套。
 */
function catFace(ctx, C, rx, ry, u, o) {
  const { muyu, busy, glance, glanceSide, act, t, intensity } = o;

  let eyes = 'cross'; // cross 斗鸡眼(基准) | wide 瞪圆眼(惊讶) | happy 笑眼 | closed 闭眼 | slit 眯眼线(得意) | wink
  let winkSide = 0; // wink 时哪只眼闭
  let peekSide = 0; // 偷瞄时哪只眼眯成短缝
  let mouth = 'w'; // w | smirk | open | tongue | pout | tight
  let mouthSide = 0;
  let openMouth = 0;
  let brow = 0; // 生气眉
  let browLift = 0; // 挑眉（惊讶）
  let blush = 0; // 动作腮红（叠在常驻腮红上）
  let sweat = 0;
  let strain = 0; // 打字紧绷：豆豆眼眯小

  const blink = blinkAt(t || 0);
  const env = act ? act.env : 0;
  const side = act ? act.side : 0;

  if (muyu) {
    if (glance > 0.02) {
      // 敲木鱼偷瞄：眯眼偷看 + 嘴角往瞄的那边翘
      peekSide = glanceSide;
      mouth = 'smirk';
      mouthSide = glanceSide;
    } else {
      eyes = 'closed';
    }
  } else if (act) {
    if (act.face) {
      // 表情动作：face 描述五官，幅度乘 env，入场/收场自然淡入淡出
      const v = act.face;
      if (v.eyes) eyes = v.eyes;
      if (v.mouth) mouth = v.mouth;
      mouthSide = v.ms ?? side;
      openMouth = (v.open ?? 0) * env;
      blush = (v.blush ?? 0) * env;
      brow = (v.brow ?? 0) * env;
      browLift = (v.browLift ?? 0) * env;
      if (eyes === 'wink') winkSide = side;
    } else {
      switch (act.id) {
        case 'peek':
          peekSide = act.side;
          mouth = 'smirk';
          mouthSide = act.side;
          break;
        // lookAround / earFlick / curious：只有头部动，脸保持豆豆眼
      }
    }
  } else if (busy) {
    // 打字：嘴抿成一条线、眼睛绷小，敲得够猛时额角冒汗
    const it = Math.max(0, Math.min(1, intensity || 0));
    mouth = 'tight';
    strain = 0.55 + 0.45 * it;
    sweat = Math.max(0, Math.min(1, (it - 0.25) / 0.75));
  } else if (blink > 0.48) {
    eyes = 'closed';
  }

  // 眼睛：斗鸡眼 / 瞪圆 / 笑眼 / 闭眼 / 眯眼线 / 偷瞄短缝
  const eyeX = rx * 0.406;
  const eyeY = -ry * 0.10;
  const drawEye = (sx) => {
    const x0 = sx * eyeX;
    let mode = eyes;
    if (mode === 'wink') mode = sx === winkSide ? 'closed' : 'cross';
    if (sx === peekSide) mode = 'peek';

    if (mode === 'cross') {
      // 斗鸡眼（基准）：白眼圈 + 黑眼珠往鼻子方向挤
      ctx.beginPath();
      ctx.arc(x0, eyeY, rx * 0.082, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2.6 * u;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x0 - sx * rx * 0.034, eyeY + ry * 0.014, rx * 0.040, 0, TAU);
      ctx.fillStyle = C.ink;
      ctx.fill();
      return;
    }
    if (mode === 'wide') {
      // 瞪圆眼：白底 + 描边 + 中间瞳孔（惊讶）
      ctx.beginPath();
      ctx.arc(x0, eyeY, rx * 0.085, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2.6 * u;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x0, eyeY + ry * 0.01, rx * 0.042, 0, TAU);
      ctx.fillStyle = C.ink;
      ctx.fill();
      return;
    }
    if (mode === 'dot') {
      // 豆豆眼：备用眼型，紧绷时眯小
      const r = rx * 0.055 * (1 - 0.35 * strain);
      ctx.beginPath();
      ctx.arc(x0, eyeY, r, 0, TAU);
      ctx.fillStyle = C.ink;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(x0 - r * 0.33, eyeY - r * 0.33, r * 0.36, 0, TAU);
      ctx.fill();
      return;
    }

    ctx.strokeStyle = C.ink;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.6 * u;
    ctx.beginPath();
    if (mode === 'happy') {
      // 笑眼：弧往上弯
      ctx.moveTo(x0 - rx * 0.13, eyeY + ry * 0.03);
      ctx.quadraticCurveTo(x0, eyeY - ry * 0.11, x0 + rx * 0.13, eyeY + ry * 0.03);
    } else if (mode === 'closed') {
      // 闭眼：弧往下弯
      ctx.moveTo(x0 - rx * 0.13, eyeY);
      ctx.quadraticCurveTo(x0, eyeY + ry * 0.10, x0 + rx * 0.13, eyeY);
    } else if (mode === 'peek') {
      // 偷瞄：半截短缝
      ctx.moveTo(x0 - rx * 0.09, eyeY + ry * 0.01);
      ctx.quadraticCurveTo(x0, eyeY + ry * 0.07, x0 + rx * 0.09, eyeY + ry * 0.01);
    } else {
      // 眯眼线：一条微微下弯的弧（得意）
      ctx.moveTo(x0 - rx * 0.13, eyeY);
      ctx.quadraticCurveTo(x0, eyeY + ry * 0.06, x0 + rx * 0.13, eyeY);
    }
    ctx.stroke();
  };
  drawEye(-1);
  drawEye(1);

  // 小眉毛：浅棕两撇，平时安静地待着，惊讶时整体上抬
  ctx.strokeStyle = C.stripe;
  ctx.lineWidth = 2.2 * u;
  ctx.lineCap = 'round';
  const browY = -ry * (0.24 - 0.06 * browLift);
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * rx * 0.30, browY);
    ctx.quadraticCurveTo(sx * rx * 0.40, browY - ry * 0.02, sx * rx * 0.50, browY - ry * 0.005);
    ctx.stroke();
  }

  // 生气眉：黑色、内低外高，压在小眉毛上
  if (brow > 0.02) {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.4 * u;
    ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * rx * 0.18, -ry * 0.20);
      ctx.lineTo(sx * rx * 0.38, -ry * (0.20 + 0.09 * brow));
      ctx.stroke();
    }
  }

  // 常驻腮红：软粉椭圆，一直在；动作卖萌时再叠一层更红的
  for (const sx of [-1, 1]) {
    ctx.fillStyle = 'rgba(249, 198, 207, 0.75)';
    ctx.beginPath();
    ctx.ellipse(sx * rx * 0.58, ry * 0.04, rx * 0.10, ry * 0.055, 0, 0, TAU);
    ctx.fill();
  }
  if (blush > 0.01) {
    ctx.fillStyle = `rgba(238, 120, 110, ${(0.30 * blush).toFixed(3)})`;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * rx * 0.58, ry * 0.04, rx * 0.10, ry * 0.055, 0, 0, TAU);
      ctx.fill();
    }
  }

  // 鼻子（粉色小三角）+ 人中
  ctx.beginPath();
  ctx.moveTo(-rx * 0.08, ry * 0.34);
  ctx.lineTo(rx * 0.08, ry * 0.34);
  ctx.lineTo(0, ry * 0.39);
  ctx.closePath();
  ctx.fillStyle = C.nose;
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, ry * 0.39);
  ctx.lineTo(0, ry * 0.45);
  ctx.lineWidth = 2.0 * u;
  ctx.stroke();

  // 嘴：ω / 坏笑 / 张嘴 / 吐舌 / 嘟嘴 / 抿紧
  const my = ry * 0.50;
  ctx.lineWidth = 2.4 * u;
  if (mouth === 'open') {
    const orx = rx * (0.045 + 0.05 * openMouth);
    const ory = ry * (0.018 + 0.03 * openMouth);
    ctx.beginPath();
    ctx.ellipse(0, my + ry * 0.012, orx, ory, 0, 0, TAU);
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, my + ry * 0.012 + ory * 0.45, orx * 0.62, ory * 0.45, 0, 0, TAU);
    ctx.fillStyle = '#e88f8f';
    ctx.fill();
  } else if (mouth === 'smirk') {
    const up = ry * 0.02;
    const down = ry * 0.004;
    ctx.beginPath();
    ctx.moveTo(-rx * 0.20, my + (mouthSide < 0 ? -up : down));
    ctx.quadraticCurveTo(0, my + ry * 0.02, rx * 0.20, my + (mouthSide > 0 ? -up : down));
    ctx.stroke();
  } else if (mouth === 'tongue') {
    // 嘴角微张 + 舌头从嘴角长长地垂出来
    ctx.beginPath();
    ctx.moveTo(-rx * 0.20, my - ry * 0.025);
    ctx.quadraticCurveTo(0, my + ry * 0.015, rx * 0.20, my - ry * 0.03);
    ctx.stroke();
    const tx = mouthSide * rx * 0.10;
    const tr = rx * 0.12 * (0.4 + 0.6 * env);
    ctx.beginPath();
    ctx.moveTo(tx - tr * 0.75, my + ry * 0.005);
    ctx.quadraticCurveTo(tx + tr * 1.30, my + ry * 0.02, tx + tr * 0.80, my + ry * 0.13);
    ctx.quadraticCurveTo(tx - tr * 0.10, my + ry * 0.16, tx - tr * 0.75, my + ry * 0.02);
    ctx.closePath();
    ctx.fillStyle = '#e88f8f';
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();
    // 舌沟
    ctx.strokeStyle = 'rgba(140, 60, 60, 0.45)';
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(tx - tr * 0.3, my + ry * 0.03);
    ctx.quadraticCurveTo(tx + tr * 0.3, my + ry * 0.06, tx + tr * 0.45, my + ry * 0.10);
    ctx.stroke();
  } else if (mouth === 'pout') {
    // 嘟嘴：一小圆嘴，粉粉的
    const pr = rx * 0.05;
    ctx.beginPath();
    ctx.ellipse(0, my + ry * 0.004, pr, pr * 0.8, 0, 0, TAU);
    ctx.fillStyle = '#e88f8f';
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();
  } else if (mouth === 'tight') {
    // 较劲时：短短一条线
    ctx.beginPath();
    ctx.moveTo(-rx * 0.16, my - ry * 0.028);
    ctx.quadraticCurveTo(0, my - ry * 0.018, rx * 0.16, my - ry * 0.028);
    ctx.stroke();
  } else {
    // ω 嘴
    ctx.beginPath();
    ctx.moveTo(-rx * 0.26, my - ry * 0.03);
    ctx.quadraticCurveTo(-rx * 0.13, my + ry * 0.05, 0, my);
    ctx.quadraticCurveTo(rx * 0.13, my + ry * 0.05, rx * 0.26, my - ry * 0.03);
    ctx.stroke();
  }

  // 胡须：三对，朝外散开（棕色）
  ctx.strokeStyle = C.whisker;
  ctx.lineWidth = 2.0 * u;
  for (const sx of [-1, 1]) {
    for (const [dy0, dy1] of [[0.26, 0.20], [0.34, 0.33], [0.42, 0.46]]) {
      ctx.beginPath();
      ctx.moveTo(sx * rx * 0.50, ry * dy0);
      ctx.quadraticCurveTo(sx * rx * 0.70, ry * (dy0 + dy1) / 2, sx * rx * 0.88, ry * dy1);
      ctx.stroke();
    }
  }

  // 额角汗滴：打字够猛时才出现
  if (sweat > 0.02) {
    const sx = rx * 0.72;
    const sy = -ry * 0.34;
    const r = rx * (0.03 + 0.03 * sweat);
    ctx.beginPath();
    ctx.moveTo(sx, sy - r * 1.9);
    ctx.bezierCurveTo(sx + r * 1.05, sy - r * 0.45, sx + r * 0.92, sy + r * 0.85, sx, sy + r * 0.85);
    ctx.bezierCurveTo(sx - r * 0.92, sy + r * 0.85, sx - r * 1.05, sy - r * 0.45, sx, sy - r * 1.9);
    ctx.closePath();
    ctx.fillStyle = '#9dd4f5';
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.4 * u;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

// ---------- 闲置小动作 ----------
// 打字时不演；发呆时先愣一下，再按「每段空闲演一个」的节奏来。
// 演哪一个由核心给的 idleEpoch（第几次进入发呆）决定，所以每次停手看到的
// 小动作都不一样；顺序固定、不随机，预览页可以按序号直接截某一动作。

const ACTIONS = [
  // 表情动作：face 里的参数由 catFace 统一应用并按 env 淡入淡出，
  // rot/dx/dy 是这一段的头部偏移（弧度 / 画面宽高比例）。
  { id: 'happy', label: '开心', dur: 1.6, face: { eyes: 'happy', blush: 0.6 } },
  { id: 'laugh', label: '大笑', dur: 1.8, face: { eyes: 'happy', mouth: 'open', open: 1, blush: 0.7 } },
  { id: 'smug', label: '得意', dur: 1.8, side: 1, face: { eyes: 'slit', mouth: 'smirk', ms: 1 } },
  { id: 'yawn', label: '困倦', dur: 2.5, face: { eyes: 'closed', mouth: 'open', open: 0.8 } },
  { id: 'peek', label: '偷瞄', dur: 2.0, side: 1 },
  { id: 'wink', label: '眨眼放电', dur: 1.4, side: -1, face: { eyes: 'wink', mouth: 'smirk', ms: -1, blush: 0.5 } },
  { id: 'tongue', label: '吐舌卖萌', dur: 1.3, side: 1, face: { mouth: 'tongue', blush: 0.5 } },
  { id: 'pout', label: '嘟嘴生气', dur: 1.6, face: { brow: 1, mouth: 'pout', blush: 0.4 } },
  { id: 'surprise', label: '惊讶', dur: 1.5, face: { eyes: 'wide', browLift: 1, mouth: 'open', open: 0.5 } },
  { id: 'curious', label: '好奇歪头', dur: 1.8, side: -1, rot: -0.120, dx: -0.008, dy: 0.004 },
  { id: 'lookAround', label: '东张西望', dur: 2.6, previewAt: 0.25 },
  { id: 'earFlick', label: '抖耳朵', dur: 0.9, previewAt: 0.125 },
];
const DAZE_LEAD = 0.7; // 停下后先愣一下再开始，免得一停手表情就跳出来

/**
 * 发呆时的小动作 → 头部偏移 + 表情状态。
 * stateAge 是进入发呆后经过的秒数；idleEpoch 是第几次进入发呆（核心维护）。
 */
function dazeAction(stateAge, idleEpoch) {
  const local = stateAge - DAZE_LEAD;
  if (local < 0) return null;
  const idx = ((idleEpoch % ACTIONS.length) + ACTIONS.length) % ACTIONS.length;
  const a = ACTIONS[idx];
  if (local >= a.dur) return null;
  const k = local / a.dur;
  const env = bump(k);
  let dx = 0;
  let dy = 0;
  let rot = 0;

  switch (a.id) {
    case 'peek':
      // 整颗脑袋偏过去偷看
      rot = a.side * 0.115 * env;
      dx = a.side * 0.012 * env;
      dy = 0.004 * env;
      break;
    case 'smug':
      // 下巴抬起来
      dy = -0.012 * env;
      rot = -0.030 * env;
      break;
    case 'earFlick':
      // 脑袋跟着耳朵轻轻一颤
      rot = Math.sin(k * Math.PI * 6) * 0.014 * env;
      break;
    case 'lookAround':
      // 先看左、再看右；脑袋一起转
      rot = Math.sin(k * Math.PI * 2) * 0.140 * env;
      dx = Math.sin(k * Math.PI * 2) * 0.012 * env;
      break;
    case 'wink':
      rot = a.side * 0.030 * env;
      dy = -0.004 * env;
      break;
    case 'yawn':
      // 仰头张嘴
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

/** 敲木鱼：落锤时点一下头；偷瞄时眯起一只眼往偷看的方向瞟 */
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

export default {
  id: 'cat',
  name: '小橘',
  desc: '斗鸡眼小胖猫，常驻腮红',
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

  // 线条风不铺胸口实心块，只有一条从身体右侧卷起来的尾巴。
  // 核心在画桌子、胳膊之前调用，所以尾巴在胳膊后面、桌面上面被自然裁掉。
  drawBodyDetail(ctx, w, h, u, { body }) {
    if (!body) return;
    inkTube(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(body.x + body.rx * 0.90, body.y - body.ry * 0.55);
        ctx.quadraticCurveTo(
          body.x + body.rx * 1.55, body.y - body.ry * 1.15,
          body.x + body.rx * 1.48, body.y - body.ry * 1.55,
        );
        ctx.quadraticCurveTo(
          body.x + body.rx * 1.44, body.y - body.ry * 1.78,
          body.x + body.rx * 1.36, body.y - body.ry * 1.72,
        );
      },
      w * 0.045,
      2.8 * u,
      STYLE.ink,
      STYLE.body,
    );
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

  drawHead({ ctx, w, h, u, t, p, rx, ry, muyu, daze, glance, glanceSide, C, act }) {
    // 抖耳朵：耳尖左右摆
    let flick = 0;
    if (act && act.id === 'earFlick') flick = Math.sin(act.k * Math.PI * 6) * act.env;
    const earDx = flick * rx * 0.10;

    const seed = 2.1;
    catEar(ctx, C, -1, rx, ry, u, -earDx);
    catEar(ctx, C, 1, rx, ry, u, earDx);

    // 05 号候选：脸压扁 13%，宽扁胖脸
    const head = blobShape(0, 0, rx * 1.01 * 1.13, ry, 0, seed);
    ctx.fillStyle = C.lineTint || C.body;
    ctx.fill(head);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3.4 * u;
    ctx.lineJoin = 'round';
    ctx.stroke(head);

    // 虎斑纹：只留头顶三杠
    ctx.strokeStyle = C.stripe;
    ctx.lineWidth = rx * 0.045;
    ctx.lineCap = 'round';
    for (const k of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(k * rx * 0.12, -ry * 0.94);
      ctx.lineTo(k * rx * 0.12, -ry * 0.68);
      ctx.stroke();
    }

    catFace(ctx, C, rx, ry, u, {
      muyu,
      busy: !muyu && !daze,
      glance,
      glanceSide,
      act,
      t,
      intensity: p.intensity,
    });
  },

  drawPortrait({ ctx, cx, cy, S, u, C }) {
    // 和主画面同一套画法，只是整体放大填满头像框。
    // 头像在 88px 的卡片里显示，线条细一档才不糊成一团。
    const lw = u * 0.62;
    const rx = S * 0.30;
    const ry = S * 0.28;
    ctx.save();
    ctx.translate(cx, cy);

    catEar(ctx, C, -1, rx, ry, lw);
    catEar(ctx, C, 1, rx, ry, lw);

    const head = blobShape(0, 0, rx * 1.01 * 1.13, ry, 0, 2.1);
    ctx.fillStyle = C.lineTint || C.body;
    ctx.fill(head);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3.4 * lw;
    ctx.lineJoin = 'round';
    ctx.stroke(head);

    ctx.strokeStyle = C.stripe;
    ctx.lineWidth = rx * 0.045;
    ctx.lineCap = 'round';
    for (const k of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(k * rx * 0.12, -ry * 0.94);
      ctx.lineTo(k * rx * 0.12, -ry * 0.68);
      ctx.stroke();
    }

    catFace(ctx, C, rx, ry, lw, {
      muyu: false,
      busy: false,
      glance: 0,
      glanceSide: 0,
      act: null,
      t: 0,
      intensity: 0,
    });
    ctx.restore();
  },
};
