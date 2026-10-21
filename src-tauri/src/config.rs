//! 配置读写：config.json
//! Windows：优先 exe 同目录（可用记事本直接编辑）；不可写时回退 %APPDATA%\WorkCalf
//! macOS：~/Library/Application Support/WorkCalf（写入 .app 包内会破坏签名）

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    /// 闲置等待时长（秒），可选 3/4/5/8
    pub idle_timeout_secs: u32,
    /// 动画速度倍率 slow | normal | fast
    pub anim_speed: String,
    /// 挂件缩放 0.5 ~ 2.0
    pub scale: f64,
    /// 鼠标穿透开关
    pub click_through: bool,
    /// 音效总开关
    pub sound_enabled: bool,
    /// 当前角色模型 id（见 ui/models.js）
    pub model_id: String,
    /// 窗口位置（逻辑坐标），-1 表示默认右下角
    pub pos_x: i32,
    pub pos_y: i32,
    /// 调试：定期导出渲染帧 + 状态机快照到 %TEMP%（供无显示环境验证）
    pub debug_dump: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            idle_timeout_secs: 4,
            anim_speed: "normal".into(),
            scale: 0.6,
            click_through: false,
            sound_enabled: true,
            model_id: "classic".into(),
            pos_x: -1,
            pos_y: -1,
            debug_dump: false,
        }
    }
}

impl AppConfig {
    pub fn load_or_create() -> (Self, PathBuf) {
        let path = config_path().unwrap_or_else(|| PathBuf::from("config.json"));
        let cfg = match fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<AppConfig>(&s).ok())
        {
            Some(c) => c,
            None => {
                let d = AppConfig::default();
                let _ = d.save(&path);
                d
            }
        };
        (cfg, path)
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, serde_json::to_string_pretty(self).unwrap())
    }
}

fn config_path() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").ok()?;
        Some(PathBuf::from(home)
            .join("Library/Application Support/WorkCalf")
            .join("config.json"))
    }
    #[cfg(not(target_os = "macos"))]
    {
        // 需求：config.json 可放在程序同目录，支持用户手动编辑
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                let p = dir.join("config.json");
                if std::fs::OpenOptions::new()
                    .write(true)
                    .create(true)
                    .open(&p)
                    .is_ok()
                {
                    return Some(p);
                }
            }
        }
        std::env::var("APPDATA")
            .ok()
            .map(|d| PathBuf::from(d).join("WorkCalf").join("config.json"))
    }
}
