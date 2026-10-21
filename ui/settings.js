// 设置面板：读取配置 → 绑定控件 → 修改实时生效（invoke set_config）
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

import { MODELS } from './models.js';

const $ = (id) => document.getElementById(id);
const els = {
  model: $('model'),
  idle: $('idle'),
  speed: $('speed'),
  scale: $('scale'),
  scaleV: $('scale-v'),
  ct: $('ct'),
  snd: $('snd'),
};

let cfg = await invoke('get_config');
invoke('debug_log', { msg: 'settings.js running, cfg=' + JSON.stringify(cfg) }).catch(() => {});

// 填充模型下拉框
els.model.innerHTML = MODELS.map(
  (m) => `<option value="${m.id}">${m.name}</option>`,
).join('');

function fill(c) {
  cfg = c;
  els.model.value = c.model_id;
  els.idle.value = String(c.idle_timeout_secs);
  els.speed.value = c.anim_speed;
  els.scale.value = c.scale;
  els.scaleV.textContent = Number(c.scale).toFixed(2);
  els.ct.checked = c.click_through;
  els.snd.checked = c.sound_enabled;
}
fill(cfg);

// 修改 → 实时下发
els.model.onchange = () => invoke('set_config', { patch: { model_id: els.model.value } });
els.idle.onchange = () => invoke('set_config', { patch: { idle_timeout_secs: Number(els.idle.value) } });
els.speed.onchange = () => invoke('set_config', { patch: { anim_speed: els.speed.value } });
els.scale.oninput = () => {
  els.scaleV.textContent = Number(els.scale.value).toFixed(2);
  invoke('set_config', { patch: { scale: Number(els.scale.value) } });
};
els.ct.onchange = () => invoke('set_config', { patch: { click_through: els.ct.checked } });
els.snd.onchange = () => invoke('set_config', { patch: { sound_enabled: els.snd.checked } });

// 托盘/右键菜单改了音效时同步回显
await listen('pet://config', (e) => fill(e.payload));

// macOS 辅助功能权限检测
const ok = await invoke('mac_permission_status');
if (!ok) $('mac-warn').style.display = 'block';
$('open-a11y').onclick = () => invoke('open_mac_accessibility');
