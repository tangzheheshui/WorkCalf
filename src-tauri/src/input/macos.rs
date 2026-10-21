//! macOS 平台：rdev 封装 CGEventTap。
//! 前置条件：系统设置 → 隐私与安全性 → 辅助功能权限；
//! 未授权时 listen 返回错误，通过 report_listener_error 通知前端引导。

use super::InputEvent;
use rdev::{listen, Button, Event, EventType};
use std::sync::mpsc::Sender;

pub struct MacInputListener;

impl MacInputListener {
    pub fn start(tx: Sender<InputEvent>) {
        let result = listen(move |e: Event| {
            if let Some(ie) = map_event(e) {
                let _ = tx.send(ie);
            }
        });
        if let Err(err) = result {
            super::report_listener_error(format!(
                "无法监听全局键鼠（请授予辅助功能权限）: {err:?}"
            ));
        }
    }
}

fn map_event(e: Event) -> Option<InputEvent> {
    match e.event_type {
        EventType::KeyPress(key) => Some(InputEvent::KeyPress(format!("{key:?}"))),
        EventType::MouseMove { x, y } => Some(InputEvent::MouseMove(x, y)),
        EventType::ButtonPress(Button::Left) => Some(InputEvent::LeftClick),
        _ => None,
    }
}
