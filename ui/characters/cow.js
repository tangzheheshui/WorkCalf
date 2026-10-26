// 白牛牛：嚣张眯眼的打工老伙计。
//
// 一个模型 = 一个自包含的角色模块。核心渲染器只调用下面这组接口，
// 不认识“牛”也不认识“狗”：
//   id / name / desc          模型元信息（设置面板卡片、配置里的 model_id）
//   style                     覆盖 DEFAULT_STYLE 的配色与开关
//   drawHead(info)            画头部（耳朵 → 脑袋 → 五官 → 烟），返回 { smokeTip }
//   drawPortrait(info)        画设置面板里的头像
//   idleAction(info)?         可选：闲置小动作，返回头部偏移与表情状态（见 shiba.js）
//
// info 由核心提供：ctx 已平移到头部中心并按 rot 旋转，坐标以头部宽高 (w, h) 为基准。
// 上架/下架模型只需在 characters/index.js 里加减一行，核心代码不用动。

import { TAU, lerp, blobPath, fillInk, cigarette } from '../draw-kit.js';

/** 牛耳朵：从脑袋两侧耷拉出来的长耳朵，根部被头挡住 */
function cowEar(ctx, C, x, y, rx, ry, rot, side, seed, lw) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  blobPath(ctx, 0, 0, rx, ry, 0, seed);
  fillInk(ctx, C.body, lw, C.ink);
  // 内耳：朝耳朵外侧偏一点
  blobPath(ctx, side * rx * 0.18, 0, rx * 0.36, ry * 0.36, 0, seed + 1.7);
  ctx.fillStyle = '#e5e0d4';
  ctx.fill();
  ctx.restore();
}

export default {
  id: 'classic',
  name: '白牛牛',
  desc: '嚣张眯眼的打工老伙计',
  style: {
    body: '#ffffff',
    patch: false, // 奶牛斑（holstein）
  },

  drawHead({ ctx, w, h, u, p, rx, ry, muyu, daze, glance, glanceSide, C }) {
    // 耳朵：两侧向外耷拉（先画，根部藏在脑袋后面）
    cowEar(ctx, C, -w * 0.196, -h * 0.108, w * 0.060, h * 0.033, -0.35, -1, 2.9, 3.6 * u);
    cowEar(ctx, C, w * 0.196, -h * 0.108, w * 0.060, h * 0.033, 0.35, 1, 6.3, 3.6 * u);

    // 头
    blobPath(ctx, 0, 0, rx, ry, 0, 1.7);
    fillInk(ctx, C.body, 4.4 * u, C.ink);

    // 奶牛斑
    if (C.patch) {
      ctx.save();
      blobPath(ctx, 0, 0, rx, ry, 0, 1.7);
      ctx.clip();
      blobPath(ctx, w * 0.17, h * 0.04, w * 0.085, h * 0.07, 0.4, 8.4);
      ctx.fillStyle = '#1c1c1c';
      ctx.fill();
      ctx.restore();
    }

    // 眼睛
    const eyeX = w * 0.083;
    const eyeY = -h * 0.048;
    const gazeX = p.headX * w * 0.016;
    const gazeY = p.headY * h * 0.011;

    if (muyu && glance > 0.02) {
      // 眯眼偷瞄：眼睛拉长、压扁、上挑成一条缝（不能圆），眼珠顶到眼角
      const ryEye = h * (0.006 + 0.009 * glance);
      const gx = glanceSide * w * 0.031 * glance;
      const gy = -h * 0.0015 * glance;
      for (const sx of [-1, 1]) {
        blobPath(ctx, sx * eyeX, eyeY, w * 0.048, ryEye, sx * 0.22, sx < 0 ? 3.4 : 5.1);
        ctx.fillStyle = C.ink;
        ctx.fill();
        // 眼珠偏向一侧：偷瞄
        ctx.beginPath();
        ctx.arc(sx * eyeX + gx, eyeY + gy, w * 0.010, 0, TAU);
        ctx.fillStyle = C.body;
        ctx.fill();
      }
    } else if (muyu) {
      // 闭眼：两道上弧
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 3.4 * u;
      ctx.lineCap = 'round';
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sx * eyeX - w * 0.032, eyeY);
        ctx.quadraticCurveTo(sx * eyeX, eyeY + h * 0.028, sx * eyeX + w * 0.032, eyeY);
        ctx.stroke();
      }
    } else {
      // 眼睛压扁一点、外眼角上挑：嚣张的眯眼
      const ryEye = daze ? h * 0.011 : h * 0.026;
      for (const sx of [-1, 1]) {
        blobPath(ctx, sx * eyeX, eyeY, w * 0.034, ryEye, sx * 0.12, sx < 0 ? 3.4 : 5.1);
        ctx.fillStyle = C.ink;
        ctx.fill();
        // 眼珠：跟着鼠标走 → 斜视
        ctx.beginPath();
        ctx.arc(sx * eyeX + gazeX, eyeY + gazeY - (daze ? h * 0.001 : 0), w * 0.0105, 0, TAU);
        ctx.fillStyle = C.body;
        ctx.fill();
      }
      if (daze) {
        // 上眼皮
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 3 * u;
        ctx.lineCap = 'round';
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * eyeX - w * 0.034, eyeY - h * 0.008);
          ctx.lineTo(sx * eyeX + w * 0.034, eyeY - h * 0.008);
          ctx.stroke();
        }
      }
    }

    // 眉毛：
    // 打字时保持“八”字怒眉 + 眉心竖纹；
    // 趴着敲木鱼时眉毛放平放松；偷瞄时挑眉（瞄向哪边，哪边挑得更高）
    {
      const browY = eyeY - h * 0.050;
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 4.0 * u;
      ctx.lineCap = 'round';
      for (const sx of [-1, 1]) {
        let oy;
        let cy;
        let iy;
        if (!muyu) {
          oy = browY - h * 0.008;
          cy = browY + h * 0.002;
          iy = browY + h * 0.016;
        } else {
          // 偷瞄时一边挑眉挑得很高、一边微微压下：看起来更像在打小算盘
          const side = sx === glanceSide;
          oy = lerp(browY + h * 0.003, browY + (side ? -h * 0.028 : h * 0.006), glance);
          cy = lerp(browY + h * 0.002, browY + (side ? -h * 0.033 : h * 0.007), glance);
          iy = lerp(browY + h * 0.001, browY + (side ? -h * 0.020 : h * 0.010), glance);
        }
        ctx.beginPath();
        ctx.moveTo(sx * w * 0.123, oy);
        ctx.quadraticCurveTo(sx * w * 0.075, cy, sx * w * 0.030, iy);
        ctx.stroke();
      }
      // 眉心的竖纹只在打字/工作时保留
      if (!muyu) {
        ctx.lineWidth = 2.4 * u;
        ctx.beginPath();
        ctx.moveTo(0, browY + h * 0.006);
        ctx.quadraticCurveTo(w * 0.002, browY + h * 0.014, 0, browY + h * 0.024);
        ctx.stroke();
      }
    }

    // 口鼻：浅色的鼻底 + 两个鼻孔，让它一眼像牛
    // （长在脸下半部，不压眼睛）
    blobPath(ctx, 0, h * 0.068, w * 0.102, h * 0.047, 0, 7.7);
    ctx.fillStyle = '#f2efe7';
    ctx.fill();
    for (const sx of [-1, 1]) {
      blobPath(ctx, sx * w * 0.019, h * 0.061, w * 0.0068, h * 0.0042, sx * 0.35, sx < 0 ? 2.2 : 4.4);
      ctx.fillStyle = C.ink;
      ctx.fill();
    }

    // 嘴：抿成一条线，下巴微微抬着——嚣张；偷瞄时嘴角向瞄的那边轻轻一挑
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.8 * u;
    ctx.lineCap = 'round';
    const my = h * 0.125;
    ctx.beginPath();
    if (muyu && glance > 0.02) {
      const smirk = h * 0.008 * glance;
      ctx.moveTo(-w * 0.031, my + h * 0.002 - (glanceSide < 0 ? smirk : 0));
      ctx.quadraticCurveTo(0, my + h * 0.001, w * 0.031, my - h * 0.002 - (glanceSide > 0 ? smirk : 0));
    } else {
      ctx.moveTo(-w * 0.031, my + h * 0.002);
      ctx.lineTo(w * 0.031, my - h * 0.002);
    }
    ctx.stroke();

    // 烟：只在敲木鱼的静心态叼着，发呆不抽
    let smokeTip = null;
    if (muyu) {
      smokeTip = cigarette(ctx, w * 0.095, h * 0.082, w, h, u, C.ink);
    }
    return { smokeTip };
  },

  drawPortrait({ ctx, cx, cy, S, u, C }) {
    cowEar(ctx, C, cx - S * 0.335, cy - S * 0.175, S * 0.10, S * 0.052, -0.35, -1, 2.9, 3.4 * u);
    cowEar(ctx, C, cx + S * 0.335, cy - S * 0.175, S * 0.10, S * 0.052, 0.35, 1, 6.3, 3.4 * u);

    blobPath(ctx, cx, cy, S * 0.35, S * 0.32, 0, 1.7);
    fillInk(ctx, C.body, 4.2 * u, C.ink);

    // 嚣张眯眼 + 八字眉 + 浅色鼻底 + 抿嘴
    for (const sx of [-1, 1]) {
      blobPath(ctx, cx + sx * S * 0.070, cy - S * 0.024, S * 0.028, S * 0.021, sx * 0.12, sx < 0 ? 3.4 : 5.1);
      ctx.fillStyle = C.ink;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + sx * S * 0.070, cy - S * 0.024, S * 0.0085, 0, TAU);
      ctx.fillStyle = C.body;
      ctx.fill();
    }
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3.4 * u;
    ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * S * 0.104, cy - S * 0.072);
      ctx.quadraticCurveTo(cx + sx * S * 0.064, cy - S * 0.052, cx + sx * S * 0.026, cy - S * 0.036);
      ctx.stroke();
    }
    blobPath(ctx, cx, cy + S * 0.072, S * 0.085, S * 0.039, 0, 7.7);
    ctx.fillStyle = '#f2efe7';
    ctx.fill();
    for (const sx of [-1, 1]) {
      blobPath(ctx, cx + sx * S * 0.016, cy + S * 0.066, S * 0.0058, S * 0.0036, sx * 0.35, sx < 0 ? 2.2 : 4.4);
      ctx.fillStyle = C.ink;
      ctx.fill();
    }
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.4 * u;
    ctx.beginPath();
    ctx.moveTo(cx - S * 0.026, cy + S * 0.129);
    ctx.lineTo(cx + S * 0.026, cy + S * 0.126);
    ctx.stroke();
  },
};
