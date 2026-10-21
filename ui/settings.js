// 设置面板：左侧导航 + 右侧页面；修改偏好实时生效（invoke set_config）
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (id) => document.getElementById(id);
const els = {
  scale: $('scale'),
  scaleV: $('scale-v'),
  opacity: $('opacity'),
  opacityV: $('opacity-v'),
  ct: $('ct'),
  snd: $('snd'),
  fbContact: $('fb-contact'),
  fbMessage: $('fb-message'),
  fbSubmit: $('fb-submit'),
  fbStatus: $('fb-status'),
};

// 反馈接口：服务器就绪后填入 POST 地址，例如 https://example.com/api/feedback
// 为空时，提交按钮会把整理好的反馈内容复制到剪贴板。
const FEEDBACK_URL = '';

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
$('app-ver').textContent = appVer;
$('about-ver').textContent = appVer;
$('side-ver').textContent = appVer;

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

// ---------- 意见反馈 ----------
function setStatus(text, kind = '') {
  els.fbStatus.textContent = text;
  els.fbStatus.className = 'status ' + kind;
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
        app_version: appVer,
        os: navigator.userAgent,
        contact,
        message,
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    setStatus('已发送，谢谢你的反馈！');
    els.fbMessage.value = '';
  } catch (e) {
    setStatus('发送失败，请稍后再试（' + e.message + '）', 'warn');
  } finally {
    els.fbSubmit.disabled = false;
  }
};

// ---------- 配置同步 ----------
// 托盘/右键菜单改了音效等设置时同步回显
await listen('pet://config', (e) => fill(e.payload));

// macOS 辅助功能权限检测
const ok = await invoke('mac_permission_status');
if (!ok) $('mac-warn').style.display = 'block';
$('open-a11y').onclick = () => invoke('open_mac_accessibility');

invoke('debug_log', { msg: 'settings ready' }).catch(() => {});
