import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
const exe = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tauri.cmd" : "tauri",
);
const child = spawn(exe, process.argv.slice(2), {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    PATH: `${join(homedir(), ".cargo", "bin")}${delimiter}${process.env.PATH ?? ""}`,
  },
});
child.on("error", (e) => {
  console.error(e.message);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
