// Hide the console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(|p| p.to_path_buf())
}

/// Folder that contains the exe: config.json and data live here (portable).
#[tauri::command]
fn app_dir() -> Result<String, String> {
    exe_dir().map(|p| p.to_string_lossy().to_string()).ok_or_else(|| "cannot locate the program folder".to_string())
}

/// A piece of Falcon BMS.exe (the program reads the version of the game from its headers: a few small pieces).
/// Only a file called "Falcon BMS.exe" and short pieces: the permission of the file plugin does not cover executables on purpose.
#[tauri::command]
fn read_exe_range(path: String, offset: u64, len: usize) -> Result<Vec<u8>, String> {
    use std::io::{Read, Seek, SeekFrom};
    let p = PathBuf::from(&path);
    let is_bms = p
        .file_name()
        .map(|n| n.to_string_lossy().eq_ignore_ascii_case("Falcon BMS.exe"))
        .unwrap_or(false);
    if !is_bms {
        return Err("only Falcon BMS.exe".to_string());
    }
    if len > 65536 || offset > 268_435_456 {
        return Err("piece too long".to_string());
    }
    let mut f = std::fs::File::open(&p).map_err(|e| e.to_string())?;
    f.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; len];
    let n = f.read(&mut buf).map_err(|e| e.to_string())?;
    buf.truncate(n);
    Ok(buf)
}

/// Looks for a Falcon BMS installation: first the installer's registry entry, then the usual folders.
/// Returns the folder that contains "Data" (e.g. C:\Falcon BMS 4.38), or nothing.
#[tauri::command]
fn detect_bms() -> Option<String> {
    let valid = |p: &str| {
        let d = PathBuf::from(p.trim());
        !p.trim().is_empty() && d.join("Data").is_dir() && d.join("Data").join("Campaign").is_dir()
    };
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        for key in [
            r"HKLM\SOFTWARE\WOW6432Node\Benchmark Sims\Falcon BMS 4.38",
            r"HKLM\SOFTWARE\Benchmark Sims\Falcon BMS 4.38",
            r"HKLM\SOFTWARE\WOW6432Node\Benchmark Sims\Falcon BMS 4.37",
        ] {
            let out = std::process::Command::new("reg")
                .args(["query", key, "/v", "baseDir"])
                .creation_flags(0x08000000) // no console window
                .output();
            if let Ok(o) = out {
                let text = String::from_utf8_lossy(&o.stdout).to_string();
                for line in text.lines() {
                    if let Some(pos) = line.find("REG_SZ") {
                        let v = line[pos + 6..].trim().trim_end_matches('\\').to_string();
                        if valid(&v) { return Some(v); }
                    }
                }
            }
        }
    }
    for drive in ["C", "D", "E", "F", "G"] {
        for sub in [
            r"Falcon BMS 4.38",
            r"Games\Falcon BMS 4.38",
            r"Program Files (x86)\Falcon BMS 4.38",
            r"Program Files\Falcon BMS 4.38",
            r"Program Files (x86)\Steam\steamapps\common\Falcon BMS",
            r"Falcon BMS",
        ] {
            let p = format!("{}:\\{}", drive, sub);
            if valid(&p) { return Some(p); }
        }
    }
    None
}

fn main() {
    // Keep the web view's own data (cache, local storage) inside the program folder so that
    // deleting or moving the folder removes/moves everything.
    if let Some(dir) = exe_dir() {
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", dir.join("data").join("webview"));
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![app_dir, detect_bms, read_exe_range])
        .run(tauri::generate_context!())
        .expect("error while running BMS Cards");
}
