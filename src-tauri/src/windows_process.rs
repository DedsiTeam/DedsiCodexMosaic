//! Give Codex a hidden, inheritable console. CREATE_NO_WINDOW leaves it without
//! a console, so shells it launches without that flag can create visible windows.
use std::{
    fs::{File, OpenOptions},
    io,
    os::windows::{
        ffi::OsStrExt,
        io::{AsRawHandle, FromRawHandle, OwnedHandle},
    },
    path::Path,
    ptr::{null, null_mut},
};
use windows_sys::Win32::{
    Foundation::{SetHandleInformation, HANDLE_FLAG_INHERIT},
    Security::SECURITY_ATTRIBUTES,
    System::{
        Pipes::CreatePipe,
        Threading::{
            CreateProcessW, DeleteProcThreadAttributeList, InitializeProcThreadAttributeList,
            TerminateProcess, UpdateProcThreadAttribute, CREATE_NEW_CONSOLE,
            EXTENDED_STARTUPINFO_PRESENT, PROCESS_INFORMATION, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
            STARTF_USESHOWWINDOW, STARTF_USESTDHANDLES, STARTUPINFOEXW, STARTUPINFOW,
        },
    },
    UI::WindowsAndMessaging::SW_HIDE,
};

pub struct HiddenConsoleChild {
    process: OwnedHandle,
    pub stdin: Option<tokio::fs::File>,
    pub stdout: Option<tokio::fs::File>,
}

// Aligned storage for the Win32 opaque attribute list, released on every path.
struct Attributes(Vec<usize>);
impl Drop for Attributes {
    fn drop(&mut self) {
        unsafe { DeleteProcThreadAttributeList(self.0.as_mut_ptr().cast()) };
    }
}

fn pipe(parent_reads: bool) -> io::Result<(File, File)> {
    let security = SECURITY_ATTRIBUTES {
        nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: null_mut(),
        bInheritHandle: 1,
    };
    let (mut read, mut write) = (null_mut(), null_mut());
    // SAFETY: valid output pointers and initialized security attributes.
    if unsafe { CreatePipe(&mut read, &mut write, &security, 0) } == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: CreatePipe returned two distinct owned handles.
    let (read, write) = unsafe { (File::from_raw_handle(read), File::from_raw_handle(write)) };
    let (parent, child) = if parent_reads {
        (read, write)
    } else {
        (write, read)
    };
    // Only the child's end may be inherited, otherwise EOF never arrives.
    if unsafe { SetHandleInformation(parent.as_raw_handle(), HANDLE_FLAG_INHERIT, 0) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok((parent, child))
}

impl HiddenConsoleChild {
    /// `arguments` must be a trusted, already quoted Windows command line.
    pub fn spawn(executable: &Path, arguments: &str) -> io::Result<Self> {
        let application: Vec<u16> = executable.as_os_str().encode_wide().chain([0]).collect();
        let mut command: Vec<u16> = std::iter::once(b'"' as u16)
            .chain(executable.as_os_str().encode_wide())
            .chain("\" ".encode_utf16())
            .chain(arguments.encode_utf16())
            .chain([0])
            .collect();
        if application[..application.len() - 1].contains(&0)
            || command[..command.len() - 1].contains(&0)
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "NUL in process command",
            ));
        }
        let (stdin, child_stdin) = pipe(false)?;
        let (stdout, child_stdout) = pipe(true)?;
        let stderr = OpenOptions::new().write(true).open("NUL")?;
        if unsafe {
            SetHandleInformation(
                stderr.as_raw_handle(),
                HANDLE_FLAG_INHERIT,
                HANDLE_FLAG_INHERIT,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        let mut bytes = 0;
        unsafe { InitializeProcThreadAttributeList(null_mut(), 1, 0, &mut bytes) };
        let mut storage = vec![0usize; bytes.div_ceil(size_of::<usize>())];
        if unsafe {
            InitializeProcThreadAttributeList(storage.as_mut_ptr().cast(), 1, 0, &mut bytes)
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        let mut attributes = Attributes(storage);
        let handles = [
            child_stdin.as_raw_handle(),
            child_stdout.as_raw_handle(),
            stderr.as_raw_handle(),
        ];
        // Restrict inheritance to our pipes and NUL, even during concurrent launches.
        if unsafe {
            UpdateProcThreadAttribute(
                attributes.0.as_mut_ptr().cast(),
                0,
                PROC_THREAD_ATTRIBUTE_HANDLE_LIST as usize,
                handles.as_ptr().cast(),
                size_of_val(&handles),
                null_mut(),
                null(),
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        let startup = STARTUPINFOEXW {
            StartupInfo: STARTUPINFOW {
                cb: size_of::<STARTUPINFOEXW>() as u32,
                dwFlags: STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES,
                wShowWindow: SW_HIDE as u16,
                hStdInput: child_stdin.as_raw_handle(),
                hStdOutput: child_stdout.as_raw_handle(),
                hStdError: stderr.as_raw_handle(),
                ..unsafe { std::mem::zeroed() }
            },
            lpAttributeList: attributes.0.as_mut_ptr().cast(),
        };
        let mut info: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };
        // SAFETY: buffers are NUL-terminated and live through the call; all three
        // standard handles are valid and inheritable. No shell parses the path.
        if unsafe {
            CreateProcessW(
                application.as_ptr(),
                command.as_mut_ptr(),
                null(),
                null(),
                1,
                CREATE_NEW_CONSOLE | EXTENDED_STARTUPINFO_PRESENT,
                null(),
                null(),
                &startup.StartupInfo,
                &mut info,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: successful CreateProcessW transfers ownership of both handles.
        let process = unsafe { OwnedHandle::from_raw_handle(info.hProcess) };
        drop(unsafe { OwnedHandle::from_raw_handle(info.hThread) });
        Ok(Self {
            process,
            stdin: Some(tokio::fs::File::from_std(stdin)),
            stdout: Some(tokio::fs::File::from_std(stdout)),
        })
    }

    pub fn start_kill(&mut self) -> io::Result<()> {
        // SAFETY: the owned process handle remains valid through this call.
        if unsafe { TerminateProcess(self.process.as_raw_handle(), 1) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
}

impl Drop for HiddenConsoleChild {
    fn drop(&mut self) {
        let _ = self.start_kill();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use windows_sys::Win32::{
        System::Console::GetConsoleWindow, UI::WindowsAndMessaging::IsWindowVisible,
    };

    // These two probes run only inside isolated subprocesses spawned by the test.
    #[test]
    #[ignore]
    fn descendant_probe() {
        let window = unsafe { GetConsoleWindow() };
        assert!(
            !window.is_null(),
            "a console must exist for descendants to inherit"
        );
        assert_eq!(unsafe { IsWindowVisible(window) }, 0);
        println!("console={window:?}");
    }

    #[test]
    #[ignore]
    fn console_probe() {
        let mut input = String::new();
        std::io::stdin().read_line(&mut input).unwrap();
        assert_eq!(input.trim(), "ping");
        let window = unsafe { GetConsoleWindow() };
        assert!(!window.is_null());
        assert_eq!(unsafe { IsWindowVisible(window) }, 0);
        // Deliberately omit CREATE_NO_WINDOW: this is the previously flashing case.
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--ignored",
                "--exact",
                "windows_process::tests::descendant_probe",
                "--nocapture",
            ])
            .output()
            .unwrap();
        assert!(output.status.success(), "{output:?}");
        assert!(String::from_utf8_lossy(&output.stdout).contains(&format!("console={window:?}")));
        println!("hidden-console-inheritance-ok");
    }

    #[tokio::test]
    async fn hidden_console_preserves_stdio_and_descendant_console() {
        let mut child = HiddenConsoleChild::spawn(
            &std::env::current_exe().unwrap(),
            "--ignored --exact windows_process::tests::console_probe --nocapture",
        )
        .unwrap();
        let mut stdin = child.stdin.take().unwrap();
        stdin.write_all(b"ping\n").await.unwrap();
        stdin.flush().await.unwrap();
        drop(stdin);
        let mut output = String::new();
        tokio::time::timeout(
            std::time::Duration::from_secs(20),
            child.stdout.take().unwrap().read_to_string(&mut output),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(output.contains("hidden-console-inheritance-ok"), "{output}");
    }

    #[tokio::test]
    #[ignore = "requires a locally installed Codex CLI"]
    async fn local_codex_command_smoke() {
        use serde_json::{json, Value};
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut child = HiddenConsoleChild::spawn(
            &crate::bridge::resolve_codex().unwrap(),
            "app-server --listen stdio://",
        )
        .unwrap();
        let mut stdin = child.stdin.take().unwrap();
        let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
        let requests = [
            json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"mosaic_console_smoke","version":"0.1.0"}}}),
            json!({"id":2,"method":"command/exec","params":{"command":["cmd.exe","/d","/c","echo mosaic-console-ok"],"timeoutMs":10000}}),
        ];
        for request in requests {
            stdin
                .write_all(format!("{request}\n").as_bytes())
                .await
                .unwrap();
            stdin.flush().await.unwrap();
            let result = tokio::time::timeout(std::time::Duration::from_secs(30), async {
                loop {
                    let line = lines
                        .next_line()
                        .await
                        .unwrap()
                        .expect("server disconnected");
                    let value: Value = serde_json::from_str(&line).unwrap();
                    if value["id"] == request["id"] {
                        break value;
                    }
                }
            })
            .await
            .unwrap();
            assert!(result.get("error").is_none(), "{result}");
            if request["id"] == 1 {
                stdin
                    .write_all(b"{\"method\":\"initialized\"}\n")
                    .await
                    .unwrap();
                stdin.flush().await.unwrap();
            } else {
                assert_eq!(result["result"]["exitCode"], 0, "{result}");
                assert!(result["result"]["stdout"]
                    .as_str()
                    .unwrap()
                    .contains("mosaic-console-ok"));
            }
        }
    }
}
