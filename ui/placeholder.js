// 占位渲染器：纯 Canvas 2D 程序化绘制的小牛，零外部资源。
// 动画全部由参数驱动（状态/敲击强度/头部朝向），与将来 Live2D 渲染器接口同构：
//   render(dt, { state, intensity, headX, headY, clickAge, speed, onKnock })
//   hitTest(x, y) -> boolean   // 供逐像素鼠标穿透
// 接入真实 Live2D 模型时，替换本文件实现即可（加载 assets/model/*.model3.json）。

const C = {
  body: '#9c6b4a',
  bodyDark: '#82563a',
  belly: '#c99e77',
  horn: '#e9dcc0',
  innerEar: '#d9a688',
  muzzle: '#d9a679',
  dark: '#3a2417',
  hoof: '#5a3d2b',
  eye: '#2b1a10',
  blush: 'rgba(232,130,110,0.35)',
  kbBoard: '#8a7256',
  kbTop: '#5c5148',
  kbSide: '#463d36',
  key: '#8a7d70',
  drum: '#6f4a30',
  drumDark: '#4a3120',
  drumTop: '#382417',
  cushion: '#a04a48',
  sweat: 'rgba(120,190,235,0.9)',
  shadow: 'rgba(60,35,15,0.18)',
};

function ell(ctx, x, y, rx, ry, color, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function rrect(ctx, x, y, w, h, r, color) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

export class PlaceholderRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.t = 0;
    this.blink = { next: 2 + Math.random() * 3, active: 0 };
    this.sweat = [];
    this.sweatTimer = 0;
    this.drumPulse = 0;
    this.ripples = [];
    this.lastPh = 0;
    this.geo = {};
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

  /** 近似命中：头部圆 + 身体椭圆（或木鱼鼓），1.15 放宽一点手感更好 */
  hitTest(x, y) {
    const g = this.geo;
    if (!g.head) return false;
    const dxh = x - g.head.x;
    const dyh = y - g.head.y;
    if (dxh * dxh + dyh * dyh < g.head.r * g.head.r * 1.32) return true;
    if (g.body) {
      const n = ((x - g.body.x) / g.body.rx) ** 2 + ((y - g.body.y) / g.body.ry) ** 2;
      if (n < 1.32) return true;
    }
    if (g.drum) {
      const n = ((x - g.drum.x) / g.drum.rx) ** 2 + ((y - g.drum.y) / g.drum.ry) ** 2;
      if (n < 1.5) return true;
    }
    return false;
  }

  render(dt, p) {
    this.t += dt * p.speed;
    const { ctx, w, h } = this;
    if (!w) return;
    const u = w / 340; // 基准缩放

    // 眨眼
    this.blink.next -= dt;
    if (this.blink.next <= 0) {
      this.blink.active = 0.14;
      this.blink.next = 2 + Math.random() * 3.5;
    }
    if (this.blink.active > 0) this.blink.active -= dt;

    ctx.clearRect(0, 0, w, h);

    if (p.state === 'muyu') this.drawMuyu(ctx, w, h, u, p, dt);
    else this.drawTyping(ctx, w, h, u, p);

    this.drawSweat(ctx, dt, p, u);
  }

  // ---------- 忙碌态 / 发呆态：前蹄搭键盘 ----------
  drawTyping(ctx, w, h, u, p) {
    const daze = p.state === 'daze';
    const cx = w / 2;
    const inten = p.intensity;

    // 打字节奏：频率随敲击强度提升；点头幅度也随之增大
    const freq = (4 + inten * 10) * (inten > 0.02 ? 1 : 0.3);
    const bobY = -Math.abs(Math.sin(this.t * freq * Math.PI)) * (1.5 + inten * 5) * u;
    const jitter = inten > 0.7 ? (Math.random() - 0.5) * 2 * inten * 1.2 * u : 0;

    const bodyC = { x: cx + jitter, y: h * 0.60 };
    const bodyRx = w * 0.29;
    const bodyRy = h * 0.20 * (1 + Math.sin(this.t * 1.3) * (daze ? 0.02 : 0.008));
    this.geo.body = { x: bodyC.x, y: bodyC.y, rx: bodyRx, ry: bodyRy };

    const headR = w * 0.185;
    const headC = {
      x: cx + p.headX * w * 0.05 + jitter,
      y: h * 0.34 + p.headY * h * 0.035 + bobY,
    };
    const headRot = p.headX * 0.12 + Math.sin(this.t * freq * Math.PI * 0.5) * 0.02 * inten;
    this.geo.head = { x: headC.x, y: headC.y, r: headR };

    // 地面阴影
    ell(ctx, cx, h * 0.92, w * 0.26, h * 0.028, C.shadow);

    // 尾巴（身体后面）
    const wag = Math.sin(this.t * 2.2) * (daze ? 0.25 : 0.35);
    ctx.save();
    ctx.translate(bodyC.x + bodyRx * 0.92, bodyC.y - bodyRy * 0.2);
    ctx.rotate(wag * 0.3);
    ctx.strokeStyle = C.bodyDark;
    ctx.lineWidth = 5 * u;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(16 * u, 14 * u, 10 * u, 34 * u);
    ctx.stroke();
    ell(ctx, 10 * u, 38 * u, 8 * u, 11 * u, C.horn, wag * 0.2);
    ctx.restore();

    // 身体 + 肚皮
    ell(ctx, bodyC.x, bodyC.y, bodyRx, bodyRy, C.body);
    ell(ctx, bodyC.x, bodyC.y + bodyRy * 0.28, bodyRx * 0.62, bodyRy * 0.55, C.belly);

    // 头部（含耳、角、脸）
    this.drawHead(ctx, headC, headR, headRot, u, p, daze);

    // 桌板 + 键盘（在身体前面，挡住下半身）
    const deskY = h * 0.795;
    rrect(ctx, w * 0.08, deskY + h * 0.055, w * 0.84, h * 0.10, 8 * u, C.kbBoard);
    ctx.save();
    ctx.translate(cx, deskY + h * 0.03);
    ctx.rotate(-0.03);
    rrect(ctx, -w * 0.35, -h * 0.028, w * 0.70, h * 0.056, 6 * u, C.kbTop);
    ctx.fillStyle = C.kbSide;
    ctx.fillRect(-w * 0.35, h * 0.02, w * 0.70, h * 0.012);
    ctx.fillStyle = C.key;
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 9; i++) {
        const kx = -w * 0.315 + i * w * 0.07;
        const ky = -h * 0.018 + r * h * 0.02;
        rrect(ctx, kx, ky, w * 0.05, h * 0.012, 2 * u, C.key);
      }
    }
    ctx.restore();

    // 前蹄搭在键盘上，敲击时交替点动
    const press = (ph) => -Math.abs(Math.sin(this.t * freq * Math.PI + ph)) * (1 + inten * 4) * u;
    const hoofW = w * 0.062;
    const hoofH = h * 0.052;
    const hy = deskY + h * 0.02;
    // 左蹄（常规）／右蹄（点击动画时抬起）
    const clickLift = p.clickAge >= 0 && p.clickAge < 0.28
      ? Math.sin((p.clickAge / 0.28) * Math.PI) * 10 * u
      : 0;
    rrect(ctx, cx - w * 0.155, hy + press(0), hoofW, hoofH, 8 * u, C.hoof);
    rrect(ctx, cx + w * 0.09, hy + press(Math.PI) - clickLift, hoofW, hoofH, 8 * u, C.hoof);
  }

  // ---------- 敲木鱼静心态：蹲坐抱木鱼 ----------
  drawMuyu(ctx, w, h, u, p, dt) {
    const cx = w / 2;

    // 敲击循环相位：0.85 次/秒 × 动画速度
    const ph = (this.t * 0.85) % 1;
    if (ph < this.lastPh) {
      this.drumPulse = 1;
      this.ripples.push({ t: 0 });
      if (p.onKnock) p.onKnock();
    }
    this.lastPh = ph;
    this.drumPulse = Math.max(0, this.drumPulse - dt * 4);

    const bodyC = { x: cx, y: h * 0.58 };
    const bodyRx = w * 0.32;
    const bodyRy = h * 0.245;
    this.geo.body = { x: bodyC.x, y: bodyC.y, rx: bodyRx, ry: bodyRy };

    const headR = w * 0.185;
    // 敲下瞬间头部随之一沉
    const bow = Math.sin(ph * Math.PI) * 0.05;
    const headC = { x: cx + p.headX * w * 0.03, y: h * 0.30 + p.headY * h * 0.02 };
    const headRot = p.headX * 0.08 + bow;
    this.geo.head = { x: headC.x, y: headC.y, r: headR };

    ell(ctx, cx, h * 0.92, w * 0.30, h * 0.028, C.shadow);

    // 后腿（蹲坐的屁股）
    ell(ctx, cx - w * 0.235, h * 0.72, w * 0.115, h * 0.105, C.bodyDark);
    ell(ctx, cx + w * 0.235, h * 0.72, w * 0.115, h * 0.105, C.bodyDark);
    // 身体 + 肚皮
    ell(ctx, bodyC.x, bodyC.y, bodyRx, bodyRy, C.body);
    ell(ctx, bodyC.x, bodyC.y + bodyRy * 0.3, bodyRx * 0.6, bodyRy * 0.5, C.belly);

    this.drawHead(ctx, headC, headR, headRot, u, p, false, true);

    // 蒲团 + 木鱼
    const drumY = h * 0.80 + this.drumPulse * 2 * u;
    const squash = 1 + this.drumPulse * 0.08;
    rrect(ctx, cx - w * 0.17, h * 0.855, w * 0.34, h * 0.055, 10 * u, C.cushion);
    const drum = { x: cx, y: drumY, rx: w * 0.155, ry: h * 0.085 * squash };
    this.geo.drum = { x: drum.x, y: drum.y, rx: drum.rx, ry: h * 0.09 };
    ell(ctx, drum.x, drum.y, drum.rx, drum.ry, C.drum);
    ctx.strokeStyle = C.drumDark;
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.ellipse(drum.x, drum.y, drum.rx, drum.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ell(ctx, drum.x, drum.y - drum.ry * 0.15, drum.rx * 0.55, drum.ry * 0.4, C.drumTop);

    // 敲击涟漪
    this.ripples = this.ripples.filter((r) => (r.t += dt) < 0.6);
    for (const r of this.ripples) {
      ctx.strokeStyle = `rgba(120,90,60,${0.35 * (1 - r.t / 0.6)})`;
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.ellipse(drum.x, drum.y - drum.ry * 0.5, drum.rx * (1 + r.t * 1.2), drum.ry * (0.6 + r.t), 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }

    // 右蹄持木槌：抬起-落下循环
    const lift = Math.sin(ph * Math.PI); // 0→1→0
    const ang = -0.9 + lift * 1.05;
    ctx.save();
    ctx.translate(cx + w * 0.185, h * 0.66);
    ctx.rotate(ang);
    rrect(ctx, -w * 0.02, -h * 0.02, w * 0.055, h * 0.16, 8 * u, C.hoof); // 前臂
    ctx.translate(0, h * 0.15);
    ctx.rotate(2.2 - lift * 0.5);
    rrect(ctx, -w * 0.014, -w * 0.16, w * 0.028, w * 0.17, 4 * u, '#c9a06b'); // 槌柄
    ell(ctx, 0, -w * 0.165, w * 0.032, w * 0.036, '#8a6238'); // 槌头
    ctx.restore();

    // 左蹄扶木鱼
    rrect(ctx, cx - w * 0.20, h * 0.72, w * 0.06, h * 0.055, 8 * u, C.hoof);
  }

  // ---------- 头部 ----------
  drawHead(ctx, c, r, rot, u, p, daze, muyu = false) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(rot);

    // 耳朵（带慢晃）
    const sway = Math.sin(this.t * (daze ? 1.1 : 0.9)) * (daze ? 0.12 : 0.06);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * r * 0.98, -r * 0.18);
      ctx.rotate(side * (0.5 + sway));
      ell(ctx, 0, 0, r * 0.30, r * 0.18, C.bodyDark);
      ell(ctx, side * -r * 0.02, 0, r * 0.18, r * 0.10, C.innerEar);
      ctx.restore();
    }
    // 牛角
    ell(ctx, -r * 0.5, -r * 0.88, r * 0.16, r * 0.26, C.horn, -0.4);
    ell(ctx, r * 0.5, -r * 0.88, r * 0.16, r * 0.26, C.horn, 0.4);

    // 头 + 额斑
    ell(ctx, 0, 0, r, r * 0.92, C.body);
    ell(ctx, 0, -r * 0.55, r * 0.42, r * 0.26, C.bodyDark);

    // 眼睛
    const blinkScale = this.blink.active > 0
      ? Math.abs(Math.cos((this.blink.active / 0.14) * Math.PI))
      : 1;
    const pupilDx = Math.max(-1, Math.min(1, p.headX)) * r * 0.05;
    for (const side of [-1, 1]) {
      const ex = side * r * 0.42 + pupilDx;
      const ey = -r * 0.10;
      if (muyu) {
        // 静心：眯眼笑（上弯弧）
        ctx.strokeStyle = C.eye;
        ctx.lineWidth = r * 0.07;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(ex, ey + r * 0.05, r * 0.13, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      } else {
        const open = daze ? 0.5 : 1; // 发呆：半闭眼
        const ry = r * 0.115 * Math.max(0.08, blinkScale * open);
        ell(ctx, ex, ey, r * 0.10, ry, C.eye);
        if (blinkScale * open > 0.25) {
          ell(ctx, ex + r * 0.03, ey - ry * 0.35, r * 0.032, ry * 0.3, '#fff');
        }
        if (open < 1) {
          // 半闭眼上眼睑
          ell(ctx, ex, ey - r * 0.10, r * 0.115, r * 0.07, C.body);
        }
      }
    }

    // 口鼻
    ell(ctx, 0, r * 0.42, r * 0.52, r * 0.36, C.muzzle);
    ell(ctx, -r * 0.16, r * 0.38, r * 0.045, r * 0.055, C.dark);
    ell(ctx, r * 0.16, r * 0.38, r * 0.045, r * 0.055, C.dark);
    ctx.strokeStyle = C.dark;
    ctx.lineWidth = r * 0.045;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (daze) {
      ctx.moveTo(-r * 0.08, r * 0.62);
      ctx.lineTo(r * 0.08, r * 0.62);
    } else {
      ctx.arc(0, r * 0.55, r * 0.10, Math.PI * 0.15, Math.PI * 0.85);
    }
    ctx.stroke();

    // 腮红
    ell(ctx, -r * 0.62, r * 0.22, r * 0.13, r * 0.08, C.blush);
    ell(ctx, r * 0.62, r * 0.22, r * 0.13, r * 0.08, C.blush);

    ctx.restore();
  }

  // ---------- 流汗（高速敲击） ----------
  drawSweat(ctx, dt, p, u) {
    const g = this.geo.head;
    if (!g) return;
    if (p.state === 'busy' && p.intensity > 0.75) {
      this.sweatTimer -= dt;
      if (this.sweatTimer <= 0) {
        this.sweatTimer = 0.28 + Math.random() * 0.2;
        this.sweat.push({
          x: g.x + g.r * (0.7 + Math.random() * 0.25),
          y: g.y - g.r * (0.85 + Math.random() * 0.1),
          vy: 30,
          life: 0.9,
        });
      }
    }
    this.sweat = this.sweat.filter((s) => (s.life -= dt) > 0);
    for (const s of this.sweat) {
      s.vy += 220 * dt;
      s.y += s.vy * dt;
      const a = Math.min(1, s.life / 0.4);
      ctx.fillStyle = C.sweat.replace('0.9', (0.9 * a).toFixed(2));
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 6 * u);
      ctx.quadraticCurveTo(s.x + 5 * u, s.y + 2 * u, s.x, s.y + 6 * u);
      ctx.quadraticCurveTo(s.x - 5 * u, s.y + 2 * u, s.x, s.y - 6 * u);
      ctx.fill();
    }
  }
}
