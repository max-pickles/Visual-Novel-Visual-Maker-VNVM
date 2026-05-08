// VNVMaker — Tauri main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use serde::Serialize;
use vnvmaker_lib::{
    parse_renpy_project, save_layout, load_layout, LayoutData,
    read_file, write_file, list_rpy_files,
    list_assets, copy_dir_all, export_standalone, import_rpy_folder,
    scaffold_from_template, apply_project_settings,
    validate_renpy_game,
    RpyProject,
};

// ─── Legacy .rpy Graph Commands ───────────────────────────────────────────────

#[tauri::command]
fn open_project(path: String) -> Result<RpyProject, String> {
    let root = PathBuf::from(&path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    let mut project = parse_renpy_project(&root)?;
    let layout = load_layout(&root);
    for node in &mut project.nodes {
        if let Some(pos) = layout.positions.get(&node.id) {
            node.x = pos[0];
            node.y = pos[1];
        }
    }
    Ok(project)
}

#[tauri::command]
fn save_node_positions(root_path: String, positions: std::collections::HashMap<String, [f64; 2]>) -> Result<(), String> {
    let root = PathBuf::from(&root_path);
    let layout = LayoutData { positions };
    save_layout(&root, &layout)
}

#[tauri::command]
fn read_rpy_file(path: String) -> Result<String, String> {
    read_file(&PathBuf::from(&path))
}

#[tauri::command]
fn write_rpy_file(path: String, content: String) -> Result<(), String> {
    write_file(&PathBuf::from(&path), &content)
}

#[tauri::command]
fn get_rpy_files(root_path: String) -> Vec<String> {
    list_rpy_files(&PathBuf::from(&root_path))
}

// ─── VNV Project Commands ─────────────────────────────────────────────────────

/// Save a .vnvmaker JSON project file
#[tauri::command]
fn save_vnv_project(path: String, content: String) -> Result<(), String> {
    write_file(&PathBuf::from(&path), &content)
}

/// Load a .vnvmaker JSON project file → returns raw JSON string
#[tauri::command]
fn load_vnv_project(path: String) -> Result<String, String> {
    read_file(&PathBuf::from(&path))
}

/// Write any text file (used by compiler output, options.rpy patching, etc.)
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    write_file(&PathBuf::from(&path), &content)
}

/// Scan a directory for asset files and return relative paths
/// asset_type: "images" | "audio"
#[tauri::command]
fn list_asset_files(root_path: String, asset_type: String) -> Vec<String> {
    list_assets(&PathBuf::from(&root_path), &asset_type)
}

/// Recursively copy a directory
#[tauri::command]
fn copy_dir_recursive(src: String, dst: String) -> Result<(), String> {
    copy_dir_all(&PathBuf::from(&src), &PathBuf::from(&dst))
}

/// Export a fully compiled project as a standalone Ren'Py game in the SDK
/// compiled_rpy: the compiled .rpy script text
/// project_name: safe ASCII name (becomes the folder name in the SDK)
/// project_title: display title
/// asset_root: path to the project folder with images/ and audio/ inside
#[tauri::command]
fn export_to_sdk(
    compiled_rpy: String,
    project_name: String,
    project_title: String,
    asset_root: String,
) -> Result<String, String> {
    export_standalone(&compiled_rpy, &project_name, &project_title, &PathBuf::from(&asset_root))
}

/// Import an existing Ren'Py game folder into VNVMaker project JSON
#[tauri::command]
fn import_from_rpy(folder_path: String) -> Result<String, String> {
    import_rpy_folder(&PathBuf::from(&folder_path))
}

/// Validate that a folder is a Ren'Py game (has game/ subdir + .rpy files).
/// Returns the resolved game/ path on success, or a descriptive error on failure.
#[tauri::command]
fn validate_renpy_project(folder_path: String) -> Result<String, String> {
    let game_dir = validate_renpy_game(&PathBuf::from(&folder_path))?;
    Ok(game_dir.to_string_lossy().replace('\\', "/"))
}

/// Scaffold a new blank project from the Templet — copies gui/, screens.rpy,
/// options.rpy etc., patches the project title, leaves images/ and audio/ empty.
#[tauri::command]
fn scaffold_new_project(project_root: String, project_title: String) -> Result<String, String> {
    scaffold_from_template(&PathBuf::from(&project_root), &project_title)
}

/// Patch gui.rpy + options.rpy with the user's chosen resolution and accent color.
#[tauri::command]
fn apply_project_theme(
    project_root: String,
    width: u32,
    height: u32,
    accent_hex: String,
    bg_hex: String,
) -> Result<(), String> {
    apply_project_settings(&PathBuf::from(&project_root), width, height, &accent_hex, &bg_hex)
}

// ─── System Info ──────────────────────────────────────────────────────────────

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Open Windows Explorer inside the given folder, showing its contents.
#[tauri::command]
fn show_in_explorer(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(path.replace("/", "\\"))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Permanently delete a project folder and all its contents.
#[tauri::command]
fn delete_project_folder(folder_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&folder_path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", folder_path));
    }
    if !path.is_dir() {
        return Err(format!("Path is not a folder: {}", folder_path));
    }
    std::fs::remove_dir_all(path).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct MonitorInfo {
    width: u32,
    height: u32,
    scale_factor: f64,
    logical_width: u32,
    logical_height: u32,
    name: String,
}

#[tauri::command]
fn get_monitor_info(window: tauri::Window) -> Result<MonitorInfo, String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No monitor found".to_string())?;

    let size = monitor.size();
    let scale = monitor.scale_factor();
    let name = monitor.name().map_or("Unknown Monitor", |v| v).to_string();

    Ok(MonitorInfo {
        width: size.width,
        height: size.height,
        scale_factor: scale,
        logical_width: (size.width as f64 / scale).round() as u32,
        logical_height: (size.height as f64 / scale).round() as u32,
        name,
    })
}

#[tauri::command]
fn set_window_size(window: tauri::Window, width: u32, height: u32) -> Result<(), String> {
    use tauri::LogicalSize;
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    window.center().map_err(|e| e.to_string())
}

// ─── Custom Folder Picker ─────────────────────────────────────────────────────

#[derive(Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
    is_vnv_project: bool,
}

/// List all entries (folders first, then files) inside a directory.
#[tauri::command]
fn list_dir_entries(path: String) -> Result<Vec<DirEntry>, String> {
    let dir = std::path::Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }
    let mut entries: Vec<DirEntry> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let p = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') { return None; } // skip hidden
            let is_dir = p.is_dir();
            // Detect VNVMaker projects and Ren'Py games:
            //  - project.vnvmaker  → VNVMaker project
            //  - project.json      → Ren'Py launcher project file
            //  - log.txt           → Ren'Py runtime log
            //  - .gitignore        → common in Ren'Py repos
            //  - game/ subfolder   → core Ren'Py structure
            let is_vnv_project = is_dir && (
                p.join("project.vnvmaker").exists() ||
                p.join("project.json").exists()      ||
                p.join("log.txt").exists()            ||
                p.join(".gitignore").exists()         ||
                p.join("game").is_dir()
            );
            Some(DirEntry {
                name,
                path: p.to_string_lossy().replace('\\', "/").to_string(),
                is_dir,
                is_vnv_project,
            })
        })
        .collect();
    // VNV projects first, then folders, then files — all alphabetical within group
    entries.sort_by(|a, b| {
        match (a.is_vnv_project, b.is_vnv_project, a.is_dir, b.is_dir) {
            (true, false, _, _) => std::cmp::Ordering::Less,
            (false, true, _, _) => std::cmp::Ordering::Greater,
            (_, _, true, false) => std::cmp::Ordering::Less,
            (_, _, false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });
    Ok(entries)
}

/// Return available Windows drive letters (e.g. ["C:/", "D:/"]).
#[tauri::command]
fn get_drives() -> Vec<String> {
    let mut drives = Vec::new();
    for c in b'A'..=b'Z' {
        let drive = format!("{}:\\", c as char);
        if std::path::Path::new(&drive).exists() {
            drives.push(format!("{}:/", c as char));
        }
    }
    drives
}

/// Scan the game/tl/ directory and return all Ren'Py translations as
/// { lang_name -> { original_text -> translated_text } }
#[tauri::command]
fn scan_tl_translations(
    root_path: String,
) -> Result<std::collections::HashMap<String, std::collections::HashMap<String, String>>, String> {
    let tl_dir = PathBuf::from(&root_path).join("game").join("tl");
    if !tl_dir.exists() {
        return Ok(std::collections::HashMap::new());
    }

    let mut result: std::collections::HashMap<
        String,
        std::collections::HashMap<String, String>,
    > = std::collections::HashMap::new();

    for entry in std::fs::read_dir(&tl_dir).map_err(|e| e.to_string())?.flatten() {
        let lang_path = entry.path();
        if !lang_path.is_dir() { continue; }
        let lang_name = lang_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        if lang_name.is_empty() || lang_name == "None" { continue; }

        let mut pairs: std::collections::HashMap<String, String> = std::collections::HashMap::new();

        if let Ok(files) = std::fs::read_dir(&lang_path) {
            for file_entry in files.flatten() {
                let fpath = file_entry.path();
                if fpath.extension().and_then(|e| e.to_str()) != Some("rpy") { continue; }
                let content = match std::fs::read_to_string(&fpath) {
                    Ok(c) => c,
                    Err(_) => continue,
                };
                // Parse:
                //   translate <lang> <id>:
                //       # [char] "original"
                //       [char] "translated"
                let mut in_block = false;
                let mut in_strings_block = false;
                let mut orig: Option<String> = None;
                for line in content.lines() {
                    let t = line.trim();
                    if t.starts_with("translate ") && t.ends_with(':') {
                        in_block = true;
                        in_strings_block = t.contains(" strings:");
                        orig = None;
                        continue;
                    }
                    if !in_block { continue; }
                    
                    if in_strings_block {
                        if t.starts_with("old ") {
                            if let Some(o) = extract_rpy_quoted(t) {
                                orig = Some(o);
                            }
                        } else if t.starts_with("new ") {
                            if let Some(ref o) = orig {
                                if let Some(tr) = extract_rpy_quoted(t) {
                                    if tr != *o { pairs.insert(o.clone(), tr); }
                                }
                            }
                            orig = None;
                        }
                    } else {
                        if t.starts_with("# ") && orig.is_none() {
                            if let Some(o) = extract_rpy_quoted(&t[2..]) { orig = Some(o); }
                            continue;
                        }
                        if !t.starts_with('#') && !t.is_empty() {
                            if let Some(ref o) = orig {
                                if let Some(tr) = extract_rpy_quoted(t) {
                                    if tr != *o { pairs.insert(o.clone(), tr); }
                                }
                            }
                            in_block = false; orig = None;
                        }
                    }
                }
            }
        }
        if !pairs.is_empty() { result.insert(lang_name, pairs); }
    }
    Ok(result)
}

/// Extract the first double-quoted string from a Ren'Py script line,
/// optionally skipping a leading character name token.
fn extract_rpy_quoted(s: &str) -> Option<String> {
    let s = s.trim();
    let start = s.find('"')?;
    let inner = &s[start + 1..];
    
    let mut end = 0;
    let mut escaped = false;
    for (i, c) in inner.char_indices() {
        if escaped {
            escaped = false;
        } else if c == '\\' {
            escaped = true;
        } else if c == '"' {
            end = i;
            return Some(inner[..end].to_string());
        }
    }
    None
}

/// Return common quick-access paths (Desktop, Documents, Downloads, VNV Projects).
#[tauri::command]
fn get_quick_access_paths() -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| "C:/Users".to_string())
        .replace('\\', "/");
    map.insert("Home".into(), home.clone());

    // Prefer OneDrive Desktop if it exists, otherwise fall back to standard Desktop
    let onedrive_desktop = format!("{}/OneDrive/Desktop", home);
    let standard_desktop = format!("{}/Desktop", home);
    if std::path::Path::new(&onedrive_desktop).exists() {
        map.insert("Desktop".into(), onedrive_desktop.clone());
        // Also expose the OneDrive root itself as a quick link
        map.insert("OneDrive".into(), format!("{}/OneDrive", home));
    } else {
        map.insert("Desktop".into(), standard_desktop);
    }

    map.insert("Documents".into(), format!("{}/Documents", home));
    map.insert("Downloads".into(), format!("{}/Downloads", home));

    // VNVMaker projects folder
    let vnv_games = format!("{}/OneDrive/Desktop/VNVMAKER/games", home);
    if std::path::Path::new(&vnv_games).exists() {
        map.insert("VNV Projects".into(), vnv_games);
    }
    map
}

// ─── Ren'Py SDK Launcher ─────────────────────────────────────────────────────────

/// Search for the Ren'Py SDK launcher binary on this machine.
/// Priority: caller hint → RENPY_SDK env var → versioned dirs in AppData/Local and C:\
fn find_renpy_exe(hint: Option<&str>) -> Option<std::path::PathBuf> {
    // 1. Caller-provided path (stored in IDE settings)
    if let Some(p) = hint {
        let pb = std::path::Path::new(p);
        if pb.exists() { return Some(pb.to_path_buf()); }
    }
    // 2. RENPY_SDK environment variable
    if let Ok(sdk) = std::env::var("RENPY_SDK") {
        for name in &["renpy.exe", "renpy.sh", "renpy"] {
            let p = std::path::Path::new(&sdk).join(name);
            if p.exists() { return Some(p); }
        }
    }
    // 3. Well-known fixed paths (Windows)
    let home = std::env::var("USERPROFILE").unwrap_or_default().replace('\\', "/");
    let fixed: &[&str] = &[
        "C:/renpy/renpy.exe",
        "C:/Program Files/Ren'Py/renpy.exe",
        "C:/Program Files (x86)/Ren'Py/renpy.exe",
    ];
    for f in fixed {
        if std::path::Path::new(f).exists() { return Some(std::path::PathBuf::from(f)); }
    }
    // 4. Scan AppData/Local and C:\ for versioned renpy-* directories
    let scan_roots = [
        format!("{}/AppData/Local", home),
        "C:/".to_string(),
        format!("{}/Desktop", home),
        std::env::current_dir().unwrap_or_default().to_string_lossy().to_string(),
    ];
    for root in &scan_roots {
        if let Ok(entries) = std::fs::read_dir(root) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name.starts_with("renpy") && entry.path().is_dir() {
                    for exe_name in &["renpy.exe", "renpy.sh", "renpy"] {
                        let exe = entry.path().join(exe_name);
                        if exe.exists() { return Some(exe); }
                    }
                }
            }
        }
    }
    None
}

/// Write a preview .rpy to game/ and spawn Ren'Py with the project.
/// Returns the Ren'Py executable path used on success.
#[tauri::command]
fn launch_renpy_preview(
    project_root: String,
    preview_rpy: String,
    sdk_exe_path: Option<String>,
    renpy_language: Option<String>,
) -> Result<String, String> {
    let root_path = std::path::Path::new(&project_root);
    let game_dir = root_path.join("game");
    if !game_dir.exists() {
        return Err(format!("No game/ directory found in: {}", project_root));
    }
    // Write the preview script
    let preview_path = game_dir.join("vnv_preview.rpy");
    std::fs::write(&preview_path, &preview_rpy)
        .map_err(|e| format!("Failed to write vnv_preview.rpy: {}", e))?;

    // Locate Ren'Py
    let exe = find_renpy_exe(sdk_exe_path.as_deref())
        .ok_or_else(|| {
            "Ren'Py SDK not found.\n\
             Set the RENPY_SDK environment variable to your SDK root, or enter the path in Settings.".to_string()
        })?;

    // Spawn detached — do not wait for it
    let mut cmd = std::process::Command::new(&exe);
    if let Some(lang) = renpy_language {
        if !lang.trim().is_empty() {
            cmd.env("RENPY_LANGUAGE", lang.trim());
        }
    }
    
    cmd.arg(root_path.to_string_lossy().replace('/', "\\"))
        .spawn()
        .map_err(|e| format!("Failed to launch Ren'Py: {}", e))?;

    Ok(exe.to_string_lossy().replace('\\', "/").to_string())
}

/// Open the official Ren'Py Launcher targeted at the parent directory of the project,
/// so the project shows up in the Ren'Py Launcher's game list natively.
#[tauri::command]
fn launch_renpy_launcher(
    project_root: String,
    sdk_exe_path: Option<String>,
) -> Result<(), String> {
    let root_path = std::path::Path::new(&project_root);
    let projects_dir = root_path.parent().unwrap_or(root_path);

    let exe = find_renpy_exe(sdk_exe_path.as_deref())
        .ok_or_else(|| {
            "Ren'Py SDK not found.\n\
             Set the RENPY_SDK environment variable to your SDK root, or enter the path in Settings.".to_string()
        })?;

    std::process::Command::new(&exe)
        .env("RENPY_PROJECTS_DIR", projects_dir.to_string_lossy().replace('/', "\\"))
        .spawn()
        .map_err(|e| format!("Failed to launch Ren'Py SDK: {}", e))?;

    Ok(())
}

/// Return the Ren'Py SDK executable path if one can be found automatically.
#[tauri::command]
fn find_renpy_sdk(hint: Option<String>) -> Option<String> {
    find_renpy_exe(hint.as_deref())
        .map(|p| p.to_string_lossy().replace('\\', "/").to_string())
}

/// Delete the temporary vnv_preview.rpy from the project's game/ directory.
#[tauri::command]
fn delete_preview_rpy(project_root: String) -> Result<(), String> {
    let preview = std::path::Path::new(&project_root).join("game").join("vnv_preview.rpy");
    if preview.exists() {
        std::fs::remove_file(&preview).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

/// Permanently delete a single file.
#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    if p.is_dir() {
        return Err(format!("Path is a directory, not a file: {}", path));
    }
    std::fs::remove_file(p).map_err(|e| e.to_string())
}

#[tauri::command]
fn distribute_renpy_build(
    window: tauri::Window,
    project_root: String,
    package: String,
    sdk_exe_path: Option<String>,
    output_dir: Option<String>,
) -> Result<String, String> {
    use std::io::{BufRead, BufReader};
    use std::process::Stdio;
    use tauri::Emitter;

    let exe = find_renpy_exe(sdk_exe_path.as_deref()).ok_or_else(|| {
        "Ren'Py SDK not found. Set the path in IDE Settings.".to_string()
    })?;

    let root = project_root.replace('/', "\\");
    let mut cmd = std::process::Command::new(&exe);
    cmd.arg(&root).arg("distribute").arg("--package").arg(&package);

    if let Some(out) = output_dir {
        cmd.arg("--destination").arg(out.replace('/', "\\"));
    }

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn().map_err(|e| format!("Failed to launch Ren'Py distribute: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let event_name = format!("distribute-log-{}", package);
    let event_name_clone1 = event_name.clone();
    
    let window_clone1 = window.clone();
    let stdout_thread = std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() {
            let _ = window_clone1.emit(&event_name_clone1, format!("{}\n", line));
        }
    });

    let event_name_clone2 = event_name.clone();
    let window_clone2 = window.clone();
    let stderr_thread = std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            let _ = window_clone2.emit(&event_name_clone2, format!("{}\n", line));
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    
    let _ = stdout_thread.join();
    let _ = stderr_thread.join();

    if status.success() {
        Ok("Success".to_string())
    } else {
        Err(format!("Build failed with exit code: {}", status))
    }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

#[tauri::command]
fn update_app_icon(window: tauri::Window, teal_hex: String, acc_hex: String) -> Result<(), String> {
    fn parse_hex(hex: &str) -> [u8; 4] {
        let hex = hex.trim_start_matches('#');
        if hex.len() == 6 {
            let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
            let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
            let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
            [r, g, b, 255]
        } else {
            [0, 0, 0, 0]
        }
    }

    let teal = parse_hex(&teal_hex);
    let acc = parse_hex(&acc_hex);
    
    let size = 32;
    let mut rgba = Vec::with_capacity(size * size * 4);
    
    for y in 0..size {
        for x in 0..size {
            let color = if y >= 9 && y < 23 {
                if x < 14 {
                    teal
                } else if x >= 18 && x < 32 {
                    acc
                } else {
                    [0, 0, 0, 0]
                }
            } else {
                [0, 0, 0, 0]
            };
            rgba.extend_from_slice(&color);
        }
    }

    let img = tauri::image::Image::new(&rgba, size as u32, size as u32);
    window.set_icon(img).map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // Legacy .rpy graph
            open_project,
            save_node_positions,
            read_rpy_file,
            write_rpy_file,
            get_rpy_files,
            // VNV project I/O
            save_vnv_project,
            load_vnv_project,
            write_text_file,
            list_asset_files,
            copy_dir_recursive,
            export_to_sdk,
            import_from_rpy,
            validate_renpy_project,
            scaffold_new_project,
            apply_project_theme,
            // System
            get_app_version,
            show_in_explorer,
            delete_project_folder,
            delete_file,
            list_dir_entries,
            get_drives,
            get_quick_access_paths,
            get_monitor_info,
            set_window_size,
            update_app_icon,
            // Translation
            scan_tl_translations,
            // Ren'Py Live Preview
            launch_renpy_preview,
            launch_renpy_launcher,
            find_renpy_sdk,
            delete_preview_rpy,
            distribute_renpy_build,
        ])
        .run(tauri::generate_context!())
        .expect("error while running vnvmaker");
}
