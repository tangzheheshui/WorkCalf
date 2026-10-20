//! 角色状态机：忙碌态 Busy → 发呆过渡态 Daze → 敲木鱼静心态 Muyu
//! 规则：任意键鼠输入立刻回到 Busy；自最后一次输入起计时，超过阈值进 Muyu。

use serde_json::json;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

use crate::AppState;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PetState {
    Busy,
    Daze,
    Muyu,
}

impl PetState {
    pub fn as_str(self) -> &'static str {
        match self {
            PetState::Busy => "busy",
            PetState::Daze => "daze",
            PetState::Muyu => "muyu",
        }
    }
}

static LAST_INPUT: OnceLock<Mutex<Instant>> = OnceLock::new();
static CURRENT: OnceLock<Mutex<Option<PetState>>> = OnceLock::new();
pub(crate) static APP: OnceLock<AppHandle> = OnceLock::new();
static TICK_COUNT: AtomicU32 = AtomicU32::new(0);

fn last_input() -> &'static Mutex<Instant> {
    LAST_INPUT.get_or_init(|| Mutex::new(Instant::now()))
}

fn current() -> &'static Mutex<Option<PetState>> {
    CURRENT.get_or_init(|| Mutex::new(None))
}

pub fn init(app: AppHandle) {
    let _ = APP.set(app);
    std::thread::spawn(ticker_loop);
}

/// 输入事件到达：刷新闲置计时起点
pub fn touch_input() {
    *last_input().lock().unwrap() = Instant::now();
}

/// 任意输入 → 立刻打断当前动画，切回忙碌态
pub fn force_busy() {
    touch_input();
    set_state(PetState::Busy);
}

fn set_state(s: PetState) {
    let mut cur = current().lock().unwrap();
    if *cur != Some(s) {
        *cur = Some(s);
        if let Some(app) = APP.get() {
            let _ = app.emit_to("main", "pet://state", json!({ "state": s.as_str() }));
        }
    }
}

/// 调试快照：当前状态 + 距上次输入的毫秒数 + 监听器健康
pub fn debug_snapshot() -> String {
    let cur = current()
        .lock()
        .unwrap()
        .map(|s| s.as_str().to_string())
        .unwrap_or_else(|| "none".into());
    let elapsed = last_input().lock().unwrap().elapsed();
    format!(
        "state={cur} ms_since_input={} listener_ok={}",
        elapsed.as_millis(),
        crate::input::listener_ok()
    )
}

fn ticker_loop() {
    loop {
        std::thread::sleep(Duration::from_millis(100));
        let Some(app) = APP.get() else { continue };

        let threshold = {
            let st = app.state::<AppState>();
            let cfg = st.cfg.lock().unwrap();
            Duration::from_millis(u64::from(cfg.idle_timeout_secs) * 1000)
        };
        let elapsed = last_input().lock().unwrap().elapsed();

        let next = if elapsed >= threshold {
            PetState::Muyu
        } else if elapsed >= Duration::from_millis(400) {
            PetState::Daze
        } else {
            PetState::Busy
        };
        set_state(next);

        // 每 ~10s 保存一次窗口位置（拖拽后自动记忆）
        let n = TICK_COUNT.fetch_add(1, Ordering::Relaxed);
        if n % 100 == 99 {
            crate::commands::save_position_if_moved(app);
        }
    }
}
