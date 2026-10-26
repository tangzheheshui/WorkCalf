// 设置面板：左侧导航 + 右侧页面；修改偏好实时生效（invoke set_config）
import { MODELS } from './models.js';
import { drawPortrait } from './doodle.js';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// 标记脚本已经跑起来：settings.html 里的内联脚本据此判断是否要显示加载失败提示
window.__settingsBooted = true;

const $ = (id) => document.getElementById(id);
const els = {
  scale: $('scale'),
  scaleV: $('scale-v'),
  opacity: $('opacity'),
  opacityV: $('opacity-v'),
  ct: $('ct'),
  snd: $('snd'),
  rest: $('rest'),
  fbContact: $('fb-contact'),
  fbMessage: $('fb-message'),
  fbSubmit: $('fb-submit'),
  fbStatus: $('fb-status'),
  checkUpdate: $('check-update'),
  updateDownload: $('update-download'),
  updateStatus: $('update-status'),
  openSite: $('open-site'),
};

// 反馈接口：服务器就绪后填入 POST 地址，例如 https://example.com/api/feedback
// 为空时，提交按钮会把整理好的反馈内容复制到剪贴板。
const FEEDBACK_URL =
  'https://auth.tangzheheshui.cn/api/collections/wc_feedback/records';

// 更新接口：返回 {"version": "1.0.1", "updated": "2026-11-01",
// "url": "download/WorkCalf-Setup-Windows.exe", "notes": "..."}。
// url 可以写相对路径（相对本文件解析）。
const UPDATE_URL = 'https://workcalf.app.tangzheheshui.cn/version.json';

// 官网地址由更新地址推导（version.json 所在目录）
const SITE_URL = UPDATE_URL ? new URL('.', UPDATE_URL).href : '';

// ---------- 左侧导航 ----------
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.pane').forEach((p) => {
      p.classList.toggle('active', p.id === 'pane-' + btn.dataset.tab);
    });
  };
});

// ---------- 版本号 ----------
let appVer = '1.0.0';
try {
  appVer = await invoke('app_version');
} catch (e) {
  console.warn('[勤劳的牛牛] 读取版本号失败', e);
}
$('about-ver').textContent = appVer;

// ---------- 偏好 ----------
let cfg = await invoke('get_config');
invoke('debug_log', { msg: 'settings.js running, cfg=' + JSON.stringify(cfg) }).catch(() => {});

function fill(c) {
  cfg = c;
  els.scale.value = c.scale;
  els.scaleV.textContent = Number(c.scale).toFixed(2);
  els.opacity.value = c.opacity;
  els.opacityV.textContent = Number(c.opacity).toFixed(2);
  els.ct.checked = c.click_through;
  els.snd.checked = c.sound_enabled;
  if (c.rest_reminder === false) {
    els.rest.value = 'off';
  } else {
    const v = String(Math.min(5000, Math.max(1000, Number(c.rest_interval) || 1000)));
    // 配置里可能有选项之外的自定义值：补一个选项再选中
    if (![...els.rest.options].some((o) => o.value === v)) {
      els.rest.add(new Option(`每 ${v} 次`, v));
    }
    els.rest.value = v;
  }
}
fill(cfg);

els.scale.oninput = () => {
  els.scaleV.textContent = Number(els.scale.value).toFixed(2);
  invoke('set_config', { patch: { scale: Number(els.scale.value) } });
};
els.opacity.oninput = () => {
  els.opacityV.textContent = Number(els.opacity.value).toFixed(2);
  invoke('set_config', { patch: { opacity: Number(els.opacity.value) } });
};
els.ct.onchange = () => invoke('set_config', { patch: { click_through: els.ct.checked } });
els.snd.onchange = () => invoke('set_config', { patch: { sound_enabled: els.snd.checked } });
els.rest.onchange = () => {
  if (els.rest.value === 'off') {
    invoke('set_config', { patch: { rest_reminder: false } });
  } else {
    invoke('set_config', {
      patch: { rest_reminder: true, rest_interval: Number(els.rest.value) },
    });
  }
};

// ---------- 模型 ----------
const modelGrid = document.getElementById('model-grid');
const curModel = document.getElementById('cur-model');

for (const m of MODELS) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'model-card';
  card.dataset.id = m.id;
  const cv = document.createElement('canvas');
  drawPortrait(cv, m.style);
  const name = document.createElement('div');
  name.className = 'mname';
  name.textContent = m.name;
  const desc = document.createElement('div');
  desc.className = 'mdesc';
  desc.textContent = m.desc || '';
  card.append(cv, name, desc);
  card.onclick = () =>
    invoke('set_config', { patch: { model_id: m.id } }).catch((e) => {
      console.warn('[勤劳的牛牛] 切换模型失败', e);
    });
  modelGrid.appendChild(card);
}

function refreshModels(c) {
  document
    .querySelectorAll('.model-card')
    .forEach((el) => el.classList.toggle('active', el.dataset.id === c.model_id));
  const cur = MODELS.find((m) => m.id === c.model_id) || MODELS[0];
  curModel.textContent = cur.name;
}
refreshModels(cfg);

// ---------- 意见反馈 ----------
let statusTimer = 0;
function setStatus(text, kind = '', autoClearMs = 0) {
  clearTimeout(statusTimer);
  els.fbStatus.textContent = text;
  els.fbStatus.className = 'status ' + kind;
  if (autoClearMs) statusTimer = setTimeout(() => setStatus(''), autoClearMs);
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  return Promise.resolve();
}

function composeFeedback(message, contact) {
  return [
    '勤劳的牛牛 反馈',
    '版本：v' + appVer,
    '系统：' + navigator.userAgent,
    contact ? '联系方式：' + contact : '联系方式：（未填写）',
    '',
    message,
  ].join('\n');
}

els.fbSubmit.onclick = async () => {
  const message = els.fbMessage.value.trim();
  const contact = els.fbContact.value.trim();
  if (message.length < 5) {
    setStatus('再多写几个字吧，方便我们理解问题。', 'warn');
    els.fbMessage.focus();
    return;
  }

  const text = composeFeedback(message, contact);

  if (!FEEDBACK_URL) {
    try {
      await copyText(text);
      setStatus('反馈通道尚未接入，内容已复制到剪贴板。', 'warn');
    } catch (e) {
      setStatus('反馈通道尚未接入，复制也失败了：' + e, 'warn');
    }
    return;
  }

  els.fbSubmit.disabled = true;
  setStatus('正在发送…');
  try {
    const res = await fetch(FEEDBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        contact,
        version: appVer,
        os: navigator.userAgent,
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    setStatus('提交成功，谢谢你的反馈。', '', 3000);
    els.fbMessage.value = '';
  } catch (e) {
    setStatus('发送失败，请稍后再试（' + e.message + '）', 'warn');
  } finally {
    els.fbSubmit.disabled = false;
  }
};

// ---------- 打赏 ----------
// 一张聚合收款码（assets/reward-qr.png），微信和支付宝都能扫。
const rewardModal = $('reward-modal');
const rewardImg = $('reward-img');
const rewardEmpty = $('reward-empty');

function hideBrokenQr() {
  rewardImg.closest('.qr').hidden = true;
  rewardEmpty.hidden = false;
}

rewardImg.onerror = hideBrokenQr;
// 图片在脚本执行前就已加载失败（文件缺失）时，error 事件不会再触发
if (rewardImg.complete && rewardImg.naturalWidth === 0) hideBrokenQr();

function setRewardOpen(open) {
  rewardModal.hidden = !open;
}

$('fb-reward').onclick = () => setRewardOpen(true);
$('reward-close').onclick = () => setRewardOpen(false);
$('reward-mask').onclick = () => setRewardOpen(false);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!rewardModal.hidden) {
    setRewardOpen(false);
    return;
  }
  // 没有弹窗时 Esc 直接关掉设置面板，和原生窗口的关闭按钮等效
  window.close();
});

// ---------- 检查更新 ----------
function setUpdateStatus(text, kind = '') {
  els.updateStatus.textContent = text;
  els.updateStatus.className = 'status ' + kind;
}

function cmpVersion(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

let updateUrl = '';

els.checkUpdate.onclick = async () => {
  els.updateDownload.style.display = 'none';
  updateUrl = '';

  if (!UPDATE_URL) {
    setUpdateStatus('当前已是最新版本（v' + appVer + '）');
    return;
  }

  els.checkUpdate.disabled = true;
  setUpdateStatus('正在检查…');
  try {
    const res = await fetch(UPDATE_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.version && cmpVersion(data.version, appVer) > 0) {
      updateUrl = data.url ? new URL(data.url, UPDATE_URL).href : '';
      els.updateDownload.style.display = updateUrl ? '' : 'none';
      setUpdateStatus(
        '发现新版本 v' + data.version + (data.notes ? '：' + data.notes : ''),
        'warn'
      );
    } else {
      setUpdateStatus('当前已是最新版本（v' + appVer + '）');
    }
  } catch (e) {
    setUpdateStatus('检查失败，请稍后再试（' + e.message + '）', 'warn');
  } finally {
    els.checkUpdate.disabled = false;
  }
};

els.updateDownload.onclick = async () => {
  if (!updateUrl) return;
  try {
    await invoke('open_url', { url: updateUrl });
  } catch (e) {
    setUpdateStatus('打开下载页失败，请手动访问：' + updateUrl, 'warn');
  }
};

els.openSite.onclick = async () => {
  if (!SITE_URL) {
    setUpdateStatus('官网地址尚未配置。', 'warn');
    return;
  }
  try {
    await invoke('open_url', { url: SITE_URL });
  } catch (e) {
    setUpdateStatus('打开官网失败：' + SITE_URL, 'warn');
  }
};

// ---------- 配置同步 ----------
// 托盘/右键菜单改了音效等设置时同步回显
await listen('pet://config', (e) => {
  fill(e.payload);
  refreshModels(e.payload);
});

// macOS 辅助功能权限检测
const ok = await invoke('mac_permission_status');
if (!ok) $('mac-warn').style.display = 'block';
$('open-a11y').onclick = () => invoke('open_mac_accessibility');

// 告诉 Rust 侧页面确实加载了（白屏看门狗用它判断）
invoke('settings_ready').catch(() => {});
invoke('debug_log', { msg: 'settings ready' }).catch(() => {});
