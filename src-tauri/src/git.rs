use serde_json::{json, Value};
use std::path::Path;
use tauri::Manager;
use tokio::process::Command;

async fn git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git").arg("-C").arg(cwd).args(args)
        .env("GIT_TERMINAL_PROMPT", "0").output().await
        .map_err(|e| format!("无法运行 Git：{e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub async fn git_info(cwd: String) -> Result<Value, String> {
    if !Path::new(&cwd).is_dir() { return Err("工作目录不存在".into()); }
    match git(&cwd, &["rev-parse", "--show-toplevel"]).await {
        Ok(root) => {
            let branches = git(&cwd, &["for-each-ref", "--format=%(refname:short)", "refs/heads/"]).await?;
            let branch = git(&cwd, &["symbolic-ref", "--quiet", "--short", "HEAD"]).await.unwrap_or_default();
            let has_commit = git(&cwd, &["rev-parse", "--verify", "HEAD^{commit}"]).await.is_ok();
            Ok(json!({"root":root,"branch":branch,"branches":branches.lines().collect::<Vec<_>>(),"hasCommit":has_commit}))
        }
        Err(error) if error.contains("not a git repository") => Ok(Value::Null),
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub async fn create_worktree(app: tauri::AppHandle, cwd: String, base: String, id: String) -> Result<Value, String> {
    if id.len() != 36 || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("无效的工作树标识".into());
    }
    let root = git(&cwd, &["rev-parse", "--show-toplevel"]).await?;
    let reference = if base == "HEAD" { "HEAD".to_string() } else { format!("refs/heads/{base}") };
    let commit = git(&root, &["rev-parse", "--verify", &format!("{reference}^{{commit}}")]).await
        .map_err(|_| "基准分支不存在或尚无提交".to_string())?;
    let parent = app.path().app_data_dir().map_err(|e| e.to_string())?.join("worktrees");
    std::fs::create_dir_all(&parent).map_err(|e| e.to_string())?;
    let path = parent.join(&id);
    let path_string = path.to_string_lossy().to_string();
    let branch = format!("mosaic/{id}");
    if path.exists() {
        // A previous successful creation may have outlived the frontend request.
        let original = git(&root, &["rev-parse", "--path-format=absolute", "--git-common-dir"]).await?;
        let existing = git(&path_string, &["rev-parse", "--path-format=absolute", "--git-common-dir"]).await?;
        let existing_branch = git(&path_string, &["symbolic-ref", "--short", "HEAD"]).await?;
        if original != existing || existing_branch != branch { return Err("工作树目录已被占用".into()); }
    } else {
        git(&root, &["worktree", "add", "-b", &branch, &path_string, &commit]).await?;
    }
    Ok(json!({"path":path_string,"branch":branch}))
}

#[tauri::command]
pub async fn delete_thread_with_worktree(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
    thread_id: String,
    cwd: String,
    path: String,
) -> Result<(), String> {
    let parent = app.path().app_data_dir().map_err(|e| e.to_string())?.join("worktrees");
    let target = Path::new(&path);
    let id = target.file_name().and_then(|s| s.to_str()).ok_or("无效的工作树目录")?;
    if target.parent() != Some(parent.as_path()) || id.len() != 36 || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("只能清理本工具创建的工作树".into());
    }
    let branch = format!("mosaic/{id}");
    let original = git(&cwd, &["rev-parse", "--path-format=absolute", "--git-common-dir"]).await?;
    let existing = git(&path, &["rev-parse", "--path-format=absolute", "--git-common-dir"]).await?;
    if original != existing || git(&path, &["symbolic-ref", "--short", "HEAD"]).await? != branch {
        return Err("工作树归属或分支已变更，不能自动清理".into());
    }
    if !git(&path, &["status", "--porcelain", "--untracked-files=all", "--ignored"]).await?.is_empty() {
        return Err("工作树中有未提交、未跟踪或忽略的文件。请先保存并清理，或取消勾选同时删除工作树。".into());
    }
    if git(&cwd, &["merge-base", "--is-ancestor", &branch, "HEAD"]).await.is_err() {
        return Err("工作树分支含有尚未合并到原目录当前分支的提交，请先合并，或仅删除会话。".into());
    }
    let bridge = state.bridge.lock().await.clone().ok_or("Codex 未连接")?;
    let response = bridge.request("thread/read", json!({"threadId":thread_id,"includeTurns":false})).await?;
    let thread = &response["thread"];
    if thread["cwd"].as_str() != Some(path.as_str()) { return Err("会话不属于该工作树".into()); }
    if thread["status"]["type"].as_str() == Some("active") { return Err("请先停止该会话的任务，再删除工作树".into()); }
    let others = bridge.request("thread/list", json!({"cwd":path,"limit":2,"modelProviders":[]})).await?;
    if others["data"].as_array().is_some_and(|items| items.iter().any(|t| t["id"].as_str() != Some(thread_id.as_str()))) || !others["nextCursor"].is_null() {
        return Err("该工作树还有其他会话，请先处理其他会话，或仅删除当前会话。".into());
    }
    // Delete the session first: an active writer must never lose its files.
    bridge.request("thread/delete", json!({"threadId":thread_id})).await?;
    git(&cwd, &["worktree", "remove", &path]).await
        .map_err(|e| format!("会话已删除，但工作树保留，请手动清理：{e}"))?;
    git(&cwd, &["branch", "-d", &branch]).await
        .map_err(|e| format!("会话和工作树已删除，但分支 {branch} 保留：{e}"))?;
    Ok(())
}
