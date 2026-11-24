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

/// OpenKneeboard: only where it is, nothing else. `settings` is its settings folder when it is installed (the SettingsPath it writes in the
/// registry at start, else Saved Games\OpenKneeboard), `saved` the Saved Games folder of the user (where the pages are written by default).
/// Returned as [settings, saved].
#[tauri::command]
fn find_okb() -> (Option<String>, Option<String>) {
    let saved = std::env::var("USERPROFILE").ok().map(|h| PathBuf::from(h).join("Saved Games")).filter(|p| p.is_dir());
    let mut settings: Option<String> = None;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let out = std::process::Command::new("reg")
            .args(["query", r"HKCU\Software\Fred Emmott\OpenKneeboard", "/v", "SettingsPath"])
            .creation_flags(0x08000000) // no console window
            .output();
        if let Ok(o) = out {
            let text = String::from_utf8_lossy(&o.stdout).to_string();
            for line in text.lines() {
                if let Some(pos) = line.find("REG_SZ") {
                    let v = line[pos + 6..].trim().trim_end_matches('\\').to_string();
                    if !v.is_empty() && PathBuf::from(&v).is_dir() {
                        settings = Some(v);
                    }
                }
            }
        }
    }
    if settings.is_none() {
        settings = saved.as_ref().map(|s| s.join("OpenKneeboard")).filter(|p| p.is_dir()).map(|p| p.to_string_lossy().to_string());
    }
    (settings, saved.map(|p| p.to_string_lossy().to_string()))
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

/// The folder can be written: created when missing, and a small file can be written there and removed again.
fn writable(dir: &std::path::Path) -> bool {
    if std::fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join("write-test.tmp");
    let ok = std::fs::write(&probe, b"ok").is_ok();
    let _ = std::fs::remove_file(&probe);
    ok
}

fn main() {
    // Keep the web view's own data (cache, local storage) inside the program folder so that
    // deleting or moving the folder removes/moves everything. In a folder that cannot be written
    // (Program Files, a read-only folder) the web view could not start: it then keeps its data in
    // the user's own folder, and the program says at start that its folder cannot be written.
    if let Some(dir) = exe_dir() {
        let wv = dir.join("data").join("webview");
        if writable(&wv) {
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", wv);
        }
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![app_dir, detect_bms, find_okb, read_exe_range])
        .run(tauri::generate_context!())
        .expect("error while running BMS Cards");
}
