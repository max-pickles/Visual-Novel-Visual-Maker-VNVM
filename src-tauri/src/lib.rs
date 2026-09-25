// VNVMaker — Rust core
// Lean, fast Ren'Py project parser and save system.

use std::path::Path;

use walkdir::WalkDir;
use regex::Regex;

// ─── File Helpers ──────────────────────────────────────────────────────────────

pub fn read_file(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

pub fn write_file(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, content).map_err(|e| e.to_string())
}

pub fn list_rpy_files(root: &Path) -> Vec<String> {
    WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |x| x == "rpy"))
        .map(|e| {
            e.path()
                .strip_prefix(root)
                .unwrap_or(e.path())
                .to_string_lossy()
                .replace('\\', "/")
        })
        .collect()
}

// ─── Asset Scanner ─────────────────────────────────────────────────────────────

/// Walk a directory and return all asset file paths relative to root.
/// asset_type: "images" | "audio"
pub fn list_assets(root: &Path, asset_type: &str) -> Vec<String> {
    let image_exts = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];
    let audio_exts = ["ogg", "mp3", "wav", "opus", "flac"];
    let video_exts = ["webm", "mp4", "mkv", "avi", "mov", "ogv"];
    let font_exts  = ["ttf", "otf", "woff", "woff2"];

    let exts: &[&str] = if asset_type == "audio" {
        &audio_exts
    } else if asset_type == "video" {
        &video_exts
    } else if asset_type == "fonts" {
        &font_exts
    } else {
        &image_exts
    };

    WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .map_or(false, |x| exts.contains(&x.to_lowercase().as_str()))
        })
        .map(|e| {
            e.path()
                .strip_prefix(root)
                .unwrap_or(e.path())
                .to_string_lossy()
                .replace('\\', "/")
        })
        .collect()
}

// ─── Recursive Directory Copy ─────────────────────────────────────────────────

/// True if `path` doesn't exist, or is a directory with nothing in it.
pub fn dir_is_empty_or_missing(path: &Path) -> bool {
    if !path.exists() {
        return true;
    }
    match std::fs::read_dir(path) {
        Ok(mut entries) => entries.next().is_none(),
        Err(_) => false,
    }
}

/// Absolute form of `p`, resolving symlinks for the part of the path that exists.
fn absolute_path(p: &Path) -> std::path::PathBuf {
    if let Ok(c) = p.canonicalize() {
        return c;
    }
    match (p.parent(), p.file_name()) {
        (Some(parent), Some(name)) if !parent.as_os_str().is_empty() => absolute_path(parent).join(name),
        _ => p.to_path_buf(),
    }
}

/// Recursively copy src directory into dst (dst is created if needed).
pub fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    // Copying a folder onto itself truncates its files, and copying it into one
    // of its own subfolders never finishes.
    if absolute_path(dst).starts_with(absolute_path(src)) {
        return Err(format!(
            "Can't copy {} into itself. Choose a destination outside that folder.",
            src.to_string_lossy().replace('\\', "/")
        ));
    }
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        
        let fname = entry.file_name().to_string_lossy().to_lowercase();
        // Skip common locked/runtime Ren'Py directories and files
        if ty.is_dir() && (fname == "cache" || fname == "saves") {
            continue;
        }
        if !ty.is_dir() && (fname.ends_with(".save") || fname == "log.txt") {
            continue;
        }

        if ty.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            // Gracefully ignore file locks (OS error 32) so the export succeeds
            if let Err(e) = std::fs::copy(&src_path, &dst_path) {
                if e.raw_os_error() != Some(32) {
                    return Err(format!("Copy {:?} -> {:?}: {}", src_path, dst_path, e));
                }
            }
        }
    }
    Ok(())
}

/// Scaffold a brand new blank project from the Templet folder.
/// Copies gui/, options.rpy, screens.rpy, gui.rpy, and a starter script.rpy —
/// but NO story images or audio. The images/ and audio/ dirs are created empty.
///
/// `template` is the Templet `game/` folder bundled with the app. Refuses to
/// touch a `project_root` that already has files in it, so creating a project
/// can never overwrite an existing one.
pub fn scaffold_from_template(template: &Path, project_root: &Path, project_title: &str) -> Result<String, String> {
    if !template.is_dir() {
        return Err(format!("Project template not found at {:?}. Reinstall VNVMaker.", template));
    }
    if !dir_is_empty_or_missing(project_root) {
        return Err(format!(
            "A folder already exists at {}. Choose a different project title.",
            project_root.to_string_lossy().replace('\\', "/")
        ));
    }
    let game_dir = project_root.join("game");
    std::fs::create_dir_all(&game_dir).map_err(|e| e.to_string())?;

    // Copy entire template game/ into the new project game/
    copy_dir_all(template, &game_dir)?;

    // Remove any compiled .rpyc files — they'll be regenerated by Ren'Py
    for entry in WalkDir::new(&game_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |x| x == "rpyc"))
    {
        let _ = std::fs::remove_file(entry.path());
    }

    // Patch options.rpy to use the project title
    let opts_path = game_dir.join("options.rpy");
    if opts_path.exists() {
        let opts = std::fs::read_to_string(&opts_path).map_err(|e| e.to_string())?;
        let opts = Regex::new(r#"define config\.name = _\(".*?"\)"#)
            .unwrap()
            .replace(&opts, &format!(r#"define config.name = _("{}")"#, project_title))
            .to_string();
        std::fs::write(&opts_path, opts).map_err(|e| e.to_string())?;
    }

    // Ensure empty images/ audio/ saves/ cache/ tl/ dirs exist
    for dir in &["images", "audio", "saves", "cache", "tl"] {
        std::fs::create_dir_all(game_dir.join(dir)).map_err(|e| e.to_string())?;
    }

    Ok(format!("Scaffolded blank project '{}' into {:?}", project_title, game_dir))
}



// ─── Color helpers ────────────────────────────────────────────────────────────

fn hex_to_rgb(hex: &str) -> Option<(f64, f64, f64)> {
    let h = hex.trim_start_matches('#');
    if h.len() != 6 { return None; }
    let r = u8::from_str_radix(&h[0..2], 16).ok()? as f64 / 255.0;
    let g = u8::from_str_radix(&h[2..4], 16).ok()? as f64 / 255.0;
    let b = u8::from_str_radix(&h[4..6], 16).ok()? as f64 / 255.0;
    Some((r, g, b))
}

fn rgb_to_hex(r: f64, g: f64, b: f64) -> String {
    let clamp = |v: f64| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    format!("#{:02x}{:02x}{:02x}", clamp(r), clamp(g), clamp(b))
}

// ─── Apply Project Settings ───────────────────────────────────────────────────

/// Patch gui.rpy + options.rpy with the wizard-chosen resolution and accent color.
/// accent_hex:  e.g. "#e67c00"   bg_hex: e.g. "#1a0d00"
pub fn apply_project_settings(
    project_root: &Path,
    width: u32,
    height: u32,
    accent_hex: &str,
    bg_hex: &str,
) -> Result<(), String> {
    let game_dir = project_root.join("game");

    // Derive muted/hover-muted colors as darkened tints of the accent
    let (muted_hex, hover_muted_hex) = if let Some((r, g, b)) = hex_to_rgb(accent_hex) {
        (rgb_to_hex(r * 0.25, g * 0.25, b * 0.25),
         rgb_to_hex(r * 0.40, g * 0.40, b * 0.40))
    } else {
        (bg_hex.to_string(), bg_hex.to_string())
    };

    // --- gui.rpy ---------------------------------------------------------------
    let gui_path = game_dir.join("gui.rpy");
    if gui_path.exists() {
        let text = std::fs::read_to_string(&gui_path).map_err(|e| e.to_string())?;

        // Resolution: gui.init(1280, 720) → gui.init(W, H)
        let text = Regex::new(r"gui\.init\(\d+,\s*\d+\)")
            .unwrap()
            .replace(&text, &format!("gui.init({}, {})", width, height))
            .to_string();

        // Accent color — template uses double-quoted strings
        let text = Regex::new(r#"define gui\.accent_color\s*=\s*"[^"]*""#)
            .unwrap()
            .replace(&text, &format!("define gui.accent_color = \"{}\"", accent_hex))
            .to_string();

        // hover_color — template uses Color(gui.accent_color).tint(.6); keep that form
        // so Ren'Py auto-derives it from whatever accent_color is set to above.
        // Only replace if it was accidentally a string literal.
        let text = Regex::new(r#"define gui\.hover_color\s*=\s*"[^"]*""#)
            .unwrap()
            .replace(&text, "define gui.hover_color = Color(gui.accent_color).tint(.6)")
            .to_string();

        // muted_color — double-quoted in template
        let text = Regex::new(r#"define gui\.muted_color\s*=\s*"[^"]*""#)
            .unwrap()
            .replace(&text, &format!("define gui.muted_color = \"{}\"", muted_hex))
            .to_string();

        // hover_muted_color — double-quoted in template
        let text = Regex::new(r#"define gui\.hover_muted_color\s*=\s*"[^"]*""#)
            .unwrap()
            .replace(&text, &format!("define gui.hover_muted_color = \"{}\"", hover_muted_hex))
            .to_string();

        std::fs::write(&gui_path, text).map_err(|e| e.to_string())?;
    }

    // --- options.rpy -----------------------------------------------------------
    let opts_path = game_dir.join("options.rpy");
    if opts_path.exists() {
        let text = std::fs::read_to_string(&opts_path).map_err(|e| e.to_string())?;
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let proj_name = project_root.file_name()
            .unwrap_or_default()
            .to_string_lossy();
        let text = Regex::new(r#"define config\.save_directory\s*=\s*"[^"]*""#)
            .unwrap()
            .replace(&text, &format!(r#"define config.save_directory = "{}-{}""#, proj_name, ts))
            .to_string();
        std::fs::write(&opts_path, text).map_err(|e| e.to_string())?;
    }

    Ok(())
}


// ─── Ren'Py Game Validator ────────────────────────────────────────────────────

/// Checks if a folder looks like a valid Ren'Py game.
///
/// Returns Ok(game_dir) where game_dir is the path to the `game/` subdirectory
/// that actually contains the .rpy scripts (either the passed folder itself or
/// a `game/` subfolder), so the caller knows which directory to read from.
///
/// Rules (from first-principles analysis of real Ren'Py projects):
///   1. A `game/` subdirectory must exist inside the chosen folder.
///   2. That `game/` dir must contain at least one `.rpy` file.
///
/// Bonus signals (checked but not required alone):
///   - options.rpy, gui.rpy, script.rpy  → classic Ren'Py files
///   - project.json                       → Ren'Py launcher metadata
///   - log.txt                            → engine-generated on first run
pub fn validate_renpy_game(root: &Path) -> Result<std::path::PathBuf, String> {
    if !root.exists() {
        return Err(format!("Folder does not exist: {:?}", root));
    }
    if !root.is_dir() {
        return Err(format!("Path is not a folder: {:?}", root));
    }

    // Rule 1 — game/ subdirectory must exist
    let game_dir = root.join("game");
    if !game_dir.is_dir() {
        return Err(format!(
            "Not a Ren'Py project — no \"game/\" subfolder found in {:?}.\n\
             Ren'Py games always keep their scripts inside a \"game/\" folder.",
            root
        ));
    }

    // Rule 2 — game/ must have at least one .rpy file
    let has_rpy = std::fs::read_dir(&game_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .any(|e| {
            e.path()
                .extension()
                .map_or(false, |ext| ext.eq_ignore_ascii_case("rpy"))
        });

    if !has_rpy {
        return Err(format!(
            "Not a Ren'Py project — the \"game/\" folder in {:?} contains no .rpy script files.",
            root
        ));
    }

    Ok(game_dir)
}
