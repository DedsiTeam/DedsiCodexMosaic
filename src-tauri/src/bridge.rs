use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::PathBuf,
    process::Stdio,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex as StdMutex,
    },
};
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{oneshot, Mutex},
    time::{timeout, Duration},
};

type Pending = HashMap<u64, oneshot::Sender<Result<Value, String>>>;
pub struct Bridge {
    stdin: Mutex<ChildStdin>,
    pending: Mutex<Pending>,
    next: AtomicU64,
    pub alive: AtomicBool,
    child: StdMutex<Child>,
    pub executable: String,
}

pub fn resolve_codex(custom: Option<String>) -> Result<PathBuf, String> {
    if let Some(path) = custom.filter(|s| !s.trim().is_empty()) {
        let p = PathBuf::from(path.trim());
        if p.is_file() {
            return Ok(p);
        }
        return Err("Codex 路径不存在，请选择可执行文件。".into());
    }
    if let Some(p) = std::env::var_os("CODEX_BIN")
        .map(PathBuf::from)
        .filter(|p| p.is_file())
    {
        return Ok(p);
    }
    let name = if cfg!(windows) { "codex.exe" } else { "codex" };
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let p = dir.join(name);
            if p.is_file() {
                return Ok(p);
            }
        }
    }
    let mut paths = vec![
        PathBuf::from("/opt/homebrew/bin/codex"),
        PathBuf::from("/usr/local/bin/codex"),
    ];
    if cfg!(target_os = "macos") {
        paths.extend([
            PathBuf::from("/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex"),
            PathBuf::from("/Applications/Codex.app/Contents/Resources/codex"),
        ]);
    }
    if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
        paths.push(PathBuf::from(&home).join(".local/bin").join(name));
        paths.push(PathBuf::from(home).join(".bun/bin").join(name));
    }
    paths
        .into_iter()
        .find(|p| p.is_file())
        .ok_or("未找到 Codex。请安装 Codex CLI，或在设置中指定可执行文件。".into())
}

impl Bridge {
    pub async fn launch(app: AppHandle, custom: Option<String>) -> Result<Arc<Self>, String> {
        let path = resolve_codex(custom)?;
        let mut command = Command::new(&path);
        command
            .args(["app-server", "--listen", "stdio://"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut child = command
            .spawn()
            .map_err(|e| format!("无法启动 Codex：{e}"))?;
        let stdin = child.stdin.take().ok_or("无法打开 Codex 输入流")?;
        let stdout = child.stdout.take().ok_or("无法打开 Codex 输出流")?;
        let bridge = Arc::new(Self {
            stdin: Mutex::new(stdin),
            pending: Mutex::new(HashMap::new()),
            next: AtomicU64::new(1),
            alive: AtomicBool::new(true),
            child: StdMutex::new(child),
            executable: path.to_string_lossy().into(),
        });
        let reader = Arc::clone(&bridge);
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let Ok(value) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if value.get("method").is_none() {
                    if let Some(id) = value.get("id").and_then(Value::as_u64) {
                        if let Some(tx) = reader.pending.lock().await.remove(&id) {
                            let result = if let Some(error) = value.get("error") {
                                Err(error["message"]
                                    .as_str()
                                    .unwrap_or("App Server 请求失败")
                                    .to_owned())
                            } else {
                                Ok(value.get("result").cloned().unwrap_or(Value::Null))
                            };
                            let _ = tx.send(result);
                        }
                    }
                } else {
                    let _ = app.emit("codex:event", &value);
                }
            }
            reader.alive.store(false, Ordering::SeqCst);
            for (_, tx) in reader.pending.lock().await.drain() {
                let _ = tx.send(Err("Codex 连接已断开，请重新连接。".into()));
            }
            let _ = app.emit(
                "codex:event",
                json!({"method":"mosaic/disconnected","params":{}}),
            );
        });
        let initialized = bridge.request("initialize", json!({"clientInfo":{"name":"codex_mosaic","title":"DedsiCodexMosaic","version":"0.1.0"},"capabilities":{"experimentalApi":false}})).await;
        if let Err(error) = initialized {
            bridge.stop();
            return Err(error);
        }
        bridge
            .write(json!({"method":"initialized","params":{}}))
            .await?;
        Ok(bridge)
    }
    async fn write(&self, value: Value) -> Result<(), String> {
        let mut bytes = serde_json::to_vec(&value).map_err(|e| e.to_string())?;
        bytes.push(b'\n');
        let mut stdin = self.stdin.lock().await;
        stdin.write_all(&bytes).await.map_err(|e| e.to_string())?;
        stdin.flush().await.map_err(|e| e.to_string())
    }
    pub async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        if !self.alive.load(Ordering::SeqCst) {
            return Err("Codex 未连接".into());
        }
        let id = self.next.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);
        if let Err(error) = self
            .write(json!({"id":id,"method":method,"params":params}))
            .await
        {
            self.pending.lock().await.remove(&id);
            return Err(error);
        }
        let result = timeout(Duration::from_secs(120), rx).await;
        self.pending.lock().await.remove(&id);
        match result {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("Codex 连接已关闭".into()),
            Err(_) => Err("Codex 请求超时；请检查会话状态后重试。".into()),
        }
    }
    pub async fn respond(
        &self,
        id: Value,
        result: Option<Value>,
        error: Option<Value>,
    ) -> Result<(), String> {
        let value = if let Some(error) = error {
            json!({"id":id,"error":error})
        } else {
            json!({"id":id,"result":result.unwrap_or(Value::Null)})
        };
        self.write(value).await
    }
    pub fn stop(&self) {
        self.alive.store(false, Ordering::SeqCst);
        if let Ok(mut child) = self.child.lock() {
            let _ = child.start_kill();
        }
    }
}
