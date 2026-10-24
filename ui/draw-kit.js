// 手绘感绘图原语。
// 这里不持有任何配色或物种状态：颜色一律由调用方显式传入。
// 核心渲染器（doodle.js）和角色模块（characters/*.js）都只依赖本文件，
// 彼此之间不直接依赖。

export const TAU = Math.PI * 2;
export const lerp = (a, b, t) => a + (b - a) * t;

/** 带固定种子抖动的闭合椭圆路径：同一形状每帧歪法一致，不会“沸腾” */
export function blobPath(ctx, x, y, rx, ry, rot, seed) {
  const n = 26;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + Math.sin(a * 3 + seed) * 0.02 + Math.sin(a * 5 + seed * 1.7) * 0.013;
    const px = Math.cos(a) * rx * k;
    const py = Math.sin(a) * ry * k;
    const X = x + px * Math.cos(rot) - py * Math.sin(rot);
    const Y = y + px * Math.sin(rot) + py * Math.cos(rot);
    if (i === 0) ctx.moveTo(X, Y);
    else ctx.lineTo(X, Y);
  }
  ctx.closePath();
}

/** 和 blobPath 同一个抖动形状，但返回 Path2D（需要单独填/描、或当裁剪区时用） */
export function blobShape(x, y, rx, ry, rot, seed) {
  const n = 26;
  const p = new Path2D();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + Math.sin(a * 3 + seed) * 0.02 + Math.sin(a * 5 + seed * 1.7) * 0.013;
    const px = Math.cos(a) * rx * k;
    const py = Math.sin(a) * ry * k;
    const X = x + px * Math.cos(rot) - py * Math.sin(rot);
    const Y = y + px * Math.sin(rot) + py * Math.cos(rot);
    if (i === 0) p.moveTo(X, Y);
    else p.lineTo(X, Y);
  }
  p.closePath();
  return p;
}

/** 填色 + 粗描边 */
export function fillInk(ctx, fill, lw, ink) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** 一圈带描边的歪椭圆 */
export function blob(ctx, x, y, rx, ry, rot, seed, fill, lw, ink) {
  blobPath(ctx, x, y, rx, ry, rot, seed);
  fillInk(ctx, fill, lw, ink);
}

/** 粗白线 + 黑描边的“管子”（手臂/尾巴） */
export function inkTube(ctx, draw, width, lw, ink, body) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.lineWidth = width + lw * 2;
  draw();
  ctx.stroke();
  ctx.strokeStyle = body;
  ctx.lineWidth = width;
  draw();
  ctx.stroke();
}

export function rrectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * 叼在嘴边的一根烟。锚点 (x, y) 是烟身中段，尺寸基准同头部 (w, h)。
 * 返回烟头的局部坐标，供烟雾粒子发射用。
 */
export function cigarette(ctx, x, y, w, h, u, ink) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.12);
  rrectPath(ctx, 0, -h * 0.006, w * 0.105, h * 0.012, 2 * u);
  ctx.fillStyle = '#f4f2ec';
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.8 * u;
  ctx.stroke();
  // 烟头
  ctx.beginPath();
  ctx.arc(w * 0.105, 0, w * 0.009, 0, TAU);
  ctx.fillStyle = '#ff9b3d';
  ctx.fill();
  ctx.restore();

  return {
    x: x + Math.cos(-0.12) * w * 0.105,
    y: y + Math.sin(-0.12) * w * 0.105,
  };
}
