// 音效合成（占位实现）：打字哒哒声 + 木鱼声，全部 Web Audio 程序化生成，零资源文件。
// 后续接入真实音效资源时，可在此处优先加载 assets/sfx/*.mp3，失败再回退合成。

export class SoundKit {
  /** @param {() => boolean} isEnabled 音效总开关 */
  constructor(isEnabled) {
    this.isEnabled = isEnabled;
    this.ctx = null;
    this.noiseBuf = null;
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /** 打字哒哒声：短噪声爆发 + 带通滤波，随机音高模拟键盘 */
  typing() {
    if (!this.isEnabled()) return;
    try {
      const ctx = this.ensure();
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noise(ctx);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2400 + Math.random() * 1400;
      f.Q.value = 1.1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.45, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      src.connect(f);
      f.connect(g);
      g.connect(ctx.destination);
      src.start(t);
      src.stop(t + 0.05);
    } catch { /* 音频不可用时静默 */ }
  }

  /** 木鱼声：木槌噪点击 + 非谐泛音空腔共鸣，合成「笃」的敲木声 */
  muyu() {
    if (!this.isEnabled()) return;
    try {
      const ctx = this.ensure();
      const t = ctx.currentTime;
      // 每次敲击随机微调音高，连续敲不显机械
      const k = 1 + (Math.random() - 0.5) * 0.08;
      const f0 = 720 * k;

      // 攻击层：木槌碰到木头的「嗒」，短噪声过带通
      const click = ctx.createBufferSource();
      click.buffer = this.noise(ctx);
      const cf = ctx.createBiquadFilter();
      cf.type = 'bandpass';
      cf.frequency.value = 2800 * k;
      cf.Q.value = 0.8;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.4, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
      click.connect(cf); cf.connect(cg); cg.connect(ctx.destination);
      click.start(t); click.stop(t + 0.02);

      // 共鸣层：基音 + 非整数倍泛音 + 低八度空腔，轻微下坠模拟木头阻尼
      const partial = (freq, vol, dur) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, t);
        o.frequency.exponentialRampToValueAtTime(freq * 0.94, t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(t); o.stop(t + dur + 0.02);
      };
      partial(f0, 0.5, 0.14);         // 基音
      partial(f0 * 2.76, 0.12, 0.05); // 非谐泛音：木质感
      partial(f0 * 0.5, 0.16, 0.2);   // 低八度共鸣：空腔感
    } catch { /* 静默 */ }
  }

  /** 休息提醒：两声清脆的“叮咚”，和打字/木鱼声明显区分 */
  restAlert() {
    if (!this.isEnabled()) return;
    try {
      const ctx = this.ensure();
      const t0 = ctx.currentTime;
      const note = (freq, at, dur, vol) => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(freq, at);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        // 轻微泛音，听起来像小铃铛而不是纯电子音
        const o2 = ctx.createOscillator();
        o2.type = 'sine';
        o2.frequency.setValueAtTime(freq * 2, at);
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.0001, at);
        g2.gain.exponentialRampToValueAtTime(vol * 0.25, at + 0.01);
        g2.gain.exponentialRampToValueAtTime(0.0001, at + dur * 0.7);
        o.connect(g); g.connect(ctx.destination);
        o2.connect(g2); g2.connect(ctx.destination);
        o.start(at); o.stop(at + dur + 0.02);
        o2.start(at); o2.stop(at + dur + 0.02);
      };
      note(988, t0, 0.5, 0.28);
      note(740, t0 + 0.16, 0.7, 0.24);
    } catch { /* 静默 */ }
  }

  noise(ctx) {
    if (!this.noiseBuf) {
      const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      this.noiseBuf = b;
    }
    return this.noiseBuf;
  }
}
