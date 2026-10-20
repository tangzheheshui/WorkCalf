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

  /** 木鱼声：双振荡器下滑音，模拟木质空腔敲击 */
  muyu() {
    if (!this.isEnabled()) return;
    try {
      const ctx = this.ensure();
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(860, t);
      o.frequency.exponentialRampToValueAtTime(240, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      const o2 = ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.setValueAtTime(1720, t);
      o2.frequency.exponentialRampToValueAtTime(520, t + 0.08);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.14, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(g); g.connect(ctx.destination);
      o2.connect(g2); g2.connect(ctx.destination);
      o.start(t); o.stop(t + 0.2);
      o2.start(t); o2.stop(t + 0.12);
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
