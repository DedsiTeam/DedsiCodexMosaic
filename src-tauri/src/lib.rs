mod attachments;
mod bridge;
mod git;
mod links;
mod tray;
#[cfg(windows)]
mod windows_process;
use bridge::Bridge;
use serde_json::{json, Value};
use std::sync::{atomic::Ordering, Arc};
use tauri::{Manager, State};
use tokio::sync::Mutex;
#[derive(Default)]
struct AppState {
    bridge: Mutex<Option<Arc<Bridge>>>,
}
#[tauri::command]
async fn connect(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let mut slot = state.bridge.lock().await;
    if let Some(current) = slot.as_ref().filter(|b| b.alive.load(Ordering::SeqCst)) {
        return Ok(json!({"executable":current.executable}));
    }
    let bridge = Bridge::launch(app).await?;
    let result = json!({"executable":bridge.executable});
    *slot = Some(bridge);
    Ok(result)
}
#[tauri::command]
async fn rpc(state: State<'_, AppState>, method: String, params: Value) -> Result<Value, String> {
    const ALLOWED: &[&str] = &[
        "thread/list",
        "thread/delete",
        "thread/read",
        "thread/name/set",
        "thread/revert",
        "thread/start",
        "thread/resume",
        "thread/turns/list",
        "thread/items/list",
        "turn/start",
        "turn/interrupt",
        "model/list",
        "fuzzyFileSearch",
        "skills/list",
        "account/read",
        "account/rateLimits/read",
    ];
    if !ALLOWED.contains(&method.as_str()) {
        return Err("不支持的请求".into());
    }
    let bridge = state.bridge.lock().await.clone().ok_or("Codex 未连接")?;
    bridge.request(&method, params).await
}
#[tauri::command]
async fn respond(
    state: State<'_, AppState>,
    id: Value,
    result: Option<Value>,
    error: Option<Value>,
) -> Result<(), String> {
    let bridge = state.bridge.lock().await.clone().ok_or("Codex 未连接")?;
    bridge.respond(id, result, error).await
}
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(tray::setup)
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // Keep the window and its conversations alive in the tray.
                    // Only intercept after hiding succeeds, so a failure cannot trap the user.
                    if window.hide().is_ok() {
                        api.prevent_close();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![connect, rpc, respond, links::open_link, git::git_info, git::create_worktree, git::delete_thread_with_worktree, attachments::save_attachment, attachments::read_attachment])
        .build(tauri::generate_context!())
        .expect("无法启动 Codex Mosaic");
    app.run(|handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            let state = handle.state::<AppState>();
            if let Ok(slot) = state.bridge.try_lock() {
                if let Some(bridge) = slot.as_ref() {
                    bridge.stop();
                }
            };
        }
    });
}
