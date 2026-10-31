fn main() {
    // Re-embed application icons when assets change, including the macOS dev Dock icon.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
