use std::path::PathBuf;
use url::Url;

#[tauri::command]
pub async fn open_link(href: String, cwd: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let href = href.trim();
        if href.is_empty() { return Err("链接地址为空。".into()); }
        let target = if PathBuf::from(href).is_absolute() {
            // Build a file URL to decode escaped characters consistently.
            let mut url = Url::parse("file:///").map_err(|e| e.to_string())?;
            url.set_path(href);
            url
        } else if let Ok(url) = Url::parse(href) {
            url
        } else {
            let base = Url::from_directory_path(&cwd)
                .map_err(|_| "无法确定链接所属的工作目录。".to_string())?;
            base.join(href).map_err(|e| e.to_string())?
        };
        match target.scheme() {
            "http" | "https" => open::that(target.as_str()).map_err(|e| format!("无法打开浏览器：{e}")),
            "file" => {
                let path = target.to_file_path().map_err(|_| "无效的本地文件链接。".to_string())?;
                if !path.exists() { return Err(format!("文件不存在：{}", path.display())); }
                open::that(&path).map_err(|e| format!("无法打开文件：{e}"))
            }
            _ => Err("暂不支持此链接类型，请使用网页或本地文件链接。".into()),
        }
    }).await.map_err(|e| e.to_string())?
}
