//! Windows 平台：rdev 封装 Win32 低级钩子（WH_KEYBOARD_LL / WH_MOUSE_LL），
//! 无需系统辅助权限。

use super::InputEvent;
use rdev::{listen, Button, Event, EventType};
use std::sync::mpsc::Sender;

pub struct WindowsInputListener;

impl WindowsInputListener {
    pub fn start(tx: Sender<InputEvent>) {
        let result = listen(move |e: Event| {
            if let Some(ie) = map_event(e) {
                let _ = tx.send(ie);
            }
        });
        if let Err(err) = result {
            super::report_listener_error(format!("Windows 全局钩子异常: {err:?}"));
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
