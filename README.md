# DedsiCodexMosaic

一个基于 Tauri 2、React、TypeScript 和 Rust 的 Codex 多会话桌面工作台。前端使用 Bun，动画组件使用 Animate UI 2。

## 启动

需要 Bun 1.4+、Rust 工具链、对应平台的 Tauri 系统依赖，以及已登录的 Codex CLI。

```sh
bun install
bun run desktop
```

只预览界面（不能执行 Codex 任务）：

```sh
bun run dev
```

应用自动从 `CODEX_BIN`、PATH 及常见安装位置查找 Codex；macOS 同时识别 ChatGPT/Codex App 的内置可执行文件。也可以在设置中填写路径。登录沿用本机 Codex 配置，首次使用在终端执行 `codex login`。

先选择工作目录，再在任意一栏输入任务。Enter 发送，Shift+Enter 换行。每栏可独立选择模型、停止当前任务、查看命令和文件修改、处理审批。

Windows 下 App Server 使用启动时即隐藏的控制台，让普通命令子进程继承，避免执行命令时终端窗口闪现。更新程序后，请从系统托盘选择“退出程序”再启动新版，确保旧 App Server 已退出；只关闭主窗口不会重启服务。显式要求新建窗口的外部程序仍由该程序自行控制。

Windows 建议使用 Codex CLI 0.166.0 或更新版本。本机验证中，0.162.1 在沙箱准备阶段出现 `setup refresh had errors` / `node_repl.exe` 文件占用错误；升级至 0.166.0 后，cmd、运行时 PowerShell 和 Git 冒烟测试通过。Mosaic 的版本与本机 Codex CLI 版本独立，更新 Mosaic 安装包不会自动升级 CLI。

## 界面规则

- 应用默认以普通窗口启动，顶部右侧提供“退出全屏 / 进入全屏”按钮；F11 切换全屏，Esc 退出全屏（优先关闭正在交互的弹窗）。
- 首次打开工作台为空，不预建对话栏；已有会话和草稿仍恢复，未使用的空白栏不恢复。
- 左侧历史会话菜单可折叠，仅查询当前工作目录的会话；未选择目录时不读取会话。切换目录保留各目录的面板和草稿。
- 右上角可选择自由横排、双栏均分、主次双栏、三栏均分或四宫格。自由横排支持拖动栏宽和横向滚动；其他布局超出当前行时继续向下排列，内容区纵向滚动，每张卡片内独立滚动消息。卡片最小宽度为 400px，空间不足的布局不可选。
- 全屏仅隐藏左侧菜单，顶部对话数量、布局和退出全屏按钮保持显示；切回自由横排恢复原栏宽。
- 拖动卡片标题栏可插入排序，卡片以动画让位，靠近内容区边缘自动滚动；Esc 或拖出内容区松手可取消。顺序在所有布局间共用并自动保存（包括空白新对话），切换布局不会自动置顶选中会话。
- 拖动栏边缘调整宽度；聚焦分隔条后可用左右方向键调整。
- 默认浅色界面：白色背景、黑色文字、绿色强调。
- 仅使用 `#9FED72`、`#000000`、`#FFFFFF`；状态通过文字和图标区分。
- 列宽、打开的会话、草稿、工作目录、侧栏状态保存在本机。
- 侧栏底部提供账号额度入口：查看套餐、各额度窗口的剩余百分比与本地时间重置时间、Credits。连接后每分钟更新，打开面板或收到额度变更通知时刷新，也支持手动刷新。数据来自当前 Codex 登录账号；不支持查询的账号或连接失败会显示提示，界面预览不显示模拟额度。
- 会话列表支持永久删除：确认后由 Codex 物理删除历史文件、元数据及派生子会话；不会删除项目文件。
- 关闭一栏不会停止该会话；停止按钮中断当前轮次。退出应用会结束本应用启动的 App Server 进程。
- 关闭主窗口（包括 Alt+F4）仅隐藏到系统托盘，程序和正在进行的会话继续运行。左键点击托盘图标或右键选择“打开主窗口”恢复窗口；右键选择“退出程序”才会结束程序及其 App Server。

## 构建和检查

```sh
bun run build
bun run test
bun run tauri build
```

### Windows 打包

在 Windows 上安装 Bun 1.4+、Rust MSVC 工具链，以及 Visual Studio Build Tools 的“使用 C++ 的桌面开发”（包含 Windows SDK），然后执行：

```powershell
bun run build:windows
# 或从任意目录调用脚本
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows.ps1
```

脚本安装锁定的前端依赖，执行前端与 Rust 测试，再构建 Release 版本和 NSIS 安装程序。首次构建需要联网下载依赖和 NSIS 工具；Windows 打包工具缓存在 `src-tauri/target/.tauri/`。仅需跳过测试时可传入 `-SkipTests`。

输出：

- `artifacts/windows/DedsiCodexMosaic_0.0.2_x64-setup.exe`：Windows x64 安装程序（文件名随版本和构建架构变化）。

直接运行版需要系统已有 WebView2 Runtime；安装程序会在缺失时下载并安装。使用 Codex 功能仍需本机安装 Codex CLI 并完成登录。当前构建未配置代码签名。

macOS 本地调试包：

```sh
bun run tauri build --debug --bundles app
```

输出位于 `src-tauri/target/debug/bundle/macos/DedsiCodexMosaic.app`。

协议检查（只读取元数据和历史）：

```sh
bun scripts/smoke-app-server.ts
```

三会话真实流式检查（会调用模型，使用临时会话，不调用工具）：

```sh
bun scripts/smoke-app-server.ts --turns
```

当前协议类型由本机 `codex-cli 0.166.0-alpha.5.1` 生成。升级 Codex 后可执行 `bun run protocol:generate`，并重新运行验证。

## 结构

- `src/components/`：多栏会话、审批、Animate UI 组件。
- `src/lib/state.ts`：会话状态、流式事件隔离、历史合并、布局持久化。
- `src/lib/client.ts`：Tauri IPC。
- `src/protocol/`：Codex CLI 生成的协议类型。
- `src-tauri/src/bridge.rs`：stdio JSON-RPC、请求匹配、进程生命周期。

## 当前边界

已在 macOS 验证；Windows x64 已通过前端测试、Rust 编译检查、Release/NSIS 打包和主窗口启动冒烟检查，尚未验证完整业务流程与安装/卸载流程。Linux 尚未实机验证。当前未签名发布，构建对应平台前需要安装 Tauri 的系统依赖。

历史来源是本机 Codex App Server 可见的会话，不包含所有 ChatGPT 云端对话。如果已有客户端持有会话写锁，Mosaic 以只读方式加载历史；它不会抢占官方客户端。释放写锁后可以重新连接。

支持文本输入、Markdown、命令/文件变更详情、命令和文件审批、权限审批及用户问答。暂不支持完整终端交互、MCP 应用界面、跨客户端实时同步及完整 Git 分支管理。未知服务端交互会明确提示并允许拒绝，不会自动批准。

新任务采用 workspace-write 沙箱和 on-request 审批；默认多个会话共享当前目录；可为新对话开启独立 Git 工作树。

## 依赖许可

Animate UI 当前采用 MIT + Commons Clause，许可原文保存在 `licenses/animate-ui.txt`，并作为桌面包资源分发。它不是无附加限制的标准 MIT 许可。其余依赖保留各自的许可证。

参考：[Codex App Server](https://learn.chatgpt.com/docs/app-server)、[Animate UI](https://animate-ui.com/)、[Tauri](https://v2.tauri.app/)。

## Git 工作树

当前目录属于 Git 仓库时，对话输入区提供“本地环境”配置。新对话可开启“新建工作树”并选择本地基准分支（或当前 HEAD）。首次发送时创建 `mosaic/<对话栏标识>` 分支和独立工作目录，然后在该目录启动 Codex 会话；原目录的未提交修改不会复制过去。无提交的仓库需先完成首次提交。

工作树保存在应用数据目录的 `worktrees/` 下。其对话仍显示在原工作目录的历史列表中；关闭栏保留工作树。删除会话时可勾选同时删除工作树和分支；存在未提交/未跟踪/忽略文件、未合并提交或其他会话时会阻止联合清理。默认仅删除会话。当前不含合并或环境初始化脚本。查看实际分支和目录可展开对话输入区的环境配置。

## 文件与截图附件

点击输入区的回形针可选择多个文件；截图复制到剪贴板后，可直接在消息输入框粘贴。图片显示缩略图，可点击预览；发送前可以移除附件。每条消息最多 10 个附件，单文件最多 25 MB。附件草稿随对话保存，发送失败会保留。

PNG/JPEG/WebP/GIF 通过 Codex 的本地图片输入发送；其他文件保存到应用数据目录的 `attachments/`，将其本地路径交给 Codex 按任务读取，具体解析能力取决于本机工具。附件文件不随草稿移除或会话删除自动清理，以保留历史引用。
