use tauri::Manager;
use std::path::Path;
const MAX_SIZE: usize = 25 * 1024 * 1024;

#[tauri::command]
pub async fn save_attachment(app: tauri::AppHandle, id: String, name: String, bytes: Vec<u8>) -> Result<String, String> {
    if id.len() != 36 || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') { return Err("无效的附件标识".into()); }
    if bytes.len() > MAX_SIZE { return Err("单个附件不能超过 25 MB".into()); }
    let name: String = name.chars().map(|c| if c.is_control() || "/\\:*?\"<>|".contains(c) { '_' } else { c }).take(160).collect();
    if name.is_empty() || name == "." || name == ".." { return Err("无效的文件名".into()); }
    let directory = app.path().app_data_dir().map_err(|e| e.to_string())?.join("attachments").join(id);
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let path = directory.join(name);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn read_attachment(app: tauri::AppHandle, path: String) -> Result<Vec<u8>, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?.join("attachments").canonicalize().map_err(|e| e.to_string())?;
    let path = Path::new(&path).canonicalize().map_err(|e| e.to_string())?;
    if !path.starts_with(root) { return Err("只能预览本工具保存的附件".into()); }
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.len() > MAX_SIZE as u64 { return Err("附件超过大小限制".into()); }
    std::fs::read(path).map_err(|e| e.to_string())
}
