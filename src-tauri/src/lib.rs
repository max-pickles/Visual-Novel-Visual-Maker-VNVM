// VNVMaker — Rust core
// Project files, scaffolding from the Ren'Py template, and path checks.

use std::path::{Path, PathBuf};

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
        .filter(|e| e.path().extension().is_some_and(|x| x == "rpy"))
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
                .is_some_and(|x| exts.contains(&x.to_lowercase().as_str()))
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

// ─── Path checks ──────────────────────────────────────────────────────────────
// The frontend passes paths to these commands, so each command checks the path
// is the kind of file or folder it exists for.

/// True for a folder that looks like a VNVMaker project or a Ren'Py game.
pub fn looks_like_project(path: &Path) -> bool {
    path.join("project.vnvmaker").is_file() || path.join("game").is_dir()
}

/// True if `path` has the extension `ext` (case-insensitive).
pub fn has_extension(path: &Path, ext: &str) -> bool {
    path.extension().is_some_and(|e| e.eq_ignore_ascii_case(ext))
}

/// True if `path` is a file inside some game/ folder, or a project.vnvmaker
/// in a project folder: the only files the app ever deletes.
pub fn is_deletable_project_file(path: &Path) -> bool {
    let in_game_dir = path
        .ancestors()
        .skip(1)
        .any(|a| a.file_name().is_some_and(|n| n.eq_ignore_ascii_case("game")));
    let is_project_file = path.file_name().is_some_and(|n| n == "project.vnvmaker")
        && path.parent().is_some_and(looks_like_project);
    in_game_dir || is_project_file
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
        .filter(|e| e.path().extension().is_some_and(|x| x == "rpyc"))
    {
        let _ = std::fs::remove_file(entry.path());
    }

    // Name the game after the project, as Ren'Py's launcher does
    let opts_path = game_dir.join("options.rpy");
    if opts_path.exists() {
        let opts = std::fs::read_to_string(&opts_path).map_err(|e| e.to_string())?;
        let opts = set_define(&opts, "config.name", &format!("_({})", py_quote(project_title)));
        let opts = set_define(&opts, "build.name", &py_quote(&simple_name(project_title)));
        std::fs::write(&opts_path, opts).map_err(|e| e.to_string())?;
    }

    // Ensure empty images/ audio/ saves/ cache/ tl/ dirs exist
    for dir in &["images", "audio", "saves", "cache", "tl"] {
        std::fs::create_dir_all(game_dir.join(dir)).map_err(|e| e.to_string())?;
    }

    Ok(format!("Scaffolded blank project '{}' into {:?}", project_title, game_dir))
}



// ─── Ren'Py define helpers ────────────────────────────────────────────────────

/// `s` as a double-quoted Python string literal.
fn py_quote(s: &str) -> String {
    let escaped = s
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\r', "\\r")
        .replace('\n', "\\n");
    format!("\"{}\"", escaped)
}

/// The ASCII letters, digits, `-` and `_` of `title`, or "game" if it has
/// none. Ren'Py's launcher derives build.name and the save directory this way,
/// since they may not contain spaces, colons or semicolons.
fn simple_name(title: &str) -> String {
    let name: String = title
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if name.is_empty() { "game".to_string() } else { name }
}

/// Set the value of every `define <name> = …` line in `text`. `value` is
/// inserted verbatim; a trailing comment on the line is dropped.
fn set_define(text: &str, name: &str, value: &str) -> String {
    let re = Regex::new(&format!(r"(?m)^([ \t]*define[ \t]+{}[ \t]*=[ \t]*)[^\r\n]*", regex::escape(name))).unwrap();
    re.replace_all(text, |caps: &regex::Captures| format!("{}{}", &caps[1], value))
        .into_owned()
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

    // --- gui.rpy ---------------------------------------------------------------
    let gui_path = game_dir.join("gui.rpy");
    if gui_path.exists() {
        let text = std::fs::read_to_string(&gui_path).map_err(|e| e.to_string())?;

        // Resolution: gui.init(1280, 720) → gui.init(W, H)
        let mut text = Regex::new(r"gui\.init\(\d+,\s*\d+\)")
            .unwrap()
            .replace(&text, format!("gui.init({}, {})", width, height).as_str())
            .into_owned();

        // Accent color, plus the colors derived from it: hover is the accent tinted
        // toward white (as Ren'Py's launcher does), the muted colors are darkened
        // shades. Colors that aren't #rrggbb are ignored so gui.rpy stays valid.
        let quoted = |r: f64, g: f64, b: f64| format!("'{}'", rgb_to_hex(r, g, b));
        if let Some((r, g, b)) = hex_to_rgb(accent_hex) {
            let tint = |c: f64| c * 0.6 + 0.4;
            text = set_define(&text, "gui.accent_color", &quoted(r, g, b));
            text = set_define(&text, "gui.hover_color", &quoted(tint(r), tint(g), tint(b)));
            text = set_define(&text, "gui.muted_color", &quoted(r * 0.25, g * 0.25, b * 0.25));
            text = set_define(&text, "gui.hover_muted_color", &quoted(r * 0.40, g * 0.40, b * 0.40));
        } else if let Some((r, g, b)) = hex_to_rgb(bg_hex) {
            text = set_define(&text, "gui.muted_color", &quoted(r, g, b));
            text = set_define(&text, "gui.hover_muted_color", &quoted(r, g, b));
        }

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
        let save_dir = format!("{}-{}", simple_name(&proj_name), ts);
        let text = set_define(&text, "config.save_directory", &py_quote(&save_dir));
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
                .is_some_and(|ext| ext.eq_ignore_ascii_case("rpy"))
        });

    if !has_rpy {
        return Err(format!(
            "Not a Ren'Py project — the \"game/\" folder in {:?} contains no .rpy script files.",
            root
        ));
    }

    Ok(game_dir)
}

// ─── Ren'Py strings ──────────────────────────────────────────────────────────

/// The text of the first double-quoted string on a line of Ren'Py, with its
/// escapes resolved as Ren'Py reads them (`\"` is `"`, `\n` a line break).
pub fn extract_rpy_quoted(line: &str) -> Option<String> {
    let start = line.find('"')?;
    let mut text = String::new();
    let mut chars = line[start + 1..].chars();
    while let Some(c) = chars.next() {
        match c {
            '\\' => match chars.next()? {
                'n' => text.push('\n'),
                escaped => text.push(escaped),
            },
            '"' => return Some(text),
            _ => text.push(c),
        }
    }
    None
}

// ─── Ren'Py SDK ──────────────────────────────────────────────────────────────

/// The Ren'Py launchers this platform can run, most preferred first. The SDK
/// ships both renpy.exe and renpy.sh, but each only runs on its own platform.
/// `renpy` is the command that Linux packages of Ren'Py install.
#[cfg(windows)]
const RENPY_LAUNCHERS: &[&str] = &["renpy.exe"];
#[cfg(not(windows))]
const RENPY_LAUNCHERS: &[&str] = &["renpy.sh", "renpy"];

/// This platform's Ren'Py launcher in `dir`, if it has one.
pub fn renpy_launcher_in(dir: &Path) -> Option<PathBuf> {
    RENPY_LAUNCHERS.iter().map(|name| dir.join(name)).find(|p| p.is_file())
}

/// The launcher for a user-supplied SDK location: the SDK folder or a launcher
/// in it. A launcher for another platform leads to this platform's one next to
/// it, so picking renpy.exe on Linux still finds renpy.sh. Anything else is
/// ignored, so the setting can't be used to start some other program.
pub fn renpy_launcher_from_hint(hint: &str) -> Option<PathBuf> {
    let path = Path::new(hint.trim());
    if path.is_dir() {
        return renpy_launcher_in(path);
    }
    let name = path.file_name()?.to_string_lossy().to_lowercase();
    if path.is_file() && ["renpy.exe", "renpy.sh", "renpy"].contains(&name.as_str()) {
        renpy_launcher_in(path.parent()?)
    } else {
        None
    }
}

/// The launcher of a Ren'Py SDK unpacked directly in one of `roots` (in a
/// folder whose name starts with "renpy"), preferring the newest-looking name.
pub fn find_renpy_sdk_in(roots: &[PathBuf]) -> Option<PathBuf> {
    roots.iter().find_map(|root| {
        let mut sdks: Vec<PathBuf> = std::fs::read_dir(root)
            .ok()?
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().to_lowercase().starts_with("renpy"))
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        sdks.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
        sdks.iter().find_map(|sdk| renpy_launcher_in(sdk))
    })
}

/// Find a Ren'Py launcher: the user's setting first, then the RENPY_SDK
/// environment variable, a `renpy` command on the PATH (Linux packages), and
/// finally SDK folders in the usual places for this platform.
pub fn find_renpy_launcher(hint: Option<&str>) -> Option<PathBuf> {
    if let Some(launcher) = hint.and_then(renpy_launcher_from_hint) {
        return Some(launcher);
    }
    if let Some(launcher) = std::env::var_os("RENPY_SDK").and_then(|sdk| renpy_launcher_in(Path::new(&sdk))) {
        return Some(launcher);
    }
    if cfg!(not(windows)) {
        let on_path = std::env::var_os("PATH")
            .and_then(|paths| std::env::split_paths(&paths).map(|dir| dir.join("renpy")).find(|p| p.is_file()));
        if on_path.is_some() {
            return on_path;
        }
    }

    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(home) = &home {
        roots.push(home.clone());
        for sub in ["Desktop", "Downloads", "Documents"] {
            roots.push(home.join(sub));
        }
    }
    if cfg!(windows) {
        for dir in ["C:/renpy", "C:/Program Files/Ren'Py", "C:/Program Files (x86)/Ren'Py"] {
            if let Some(launcher) = renpy_launcher_in(Path::new(dir)) {
                return Some(launcher);
            }
        }
        if let Some(home) = &home {
            roots.push(home.join("AppData/Local"));
        }
        roots.push(PathBuf::from("C:/"));
    } else {
        if let Some(home) = &home {
            roots.push(home.join(".local/share"));
            roots.push(home.join("Applications"));
        }
        roots.extend(["/opt", "/usr/share", "/usr/local/share", "/Applications"].map(PathBuf::from));
    }
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd);
    }
    find_renpy_sdk_in(&roots)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// A fresh, empty temporary folder for one test.
    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("vnvmaker-test-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// root/game/images/bg.png plus root/project.vnvmaker
    fn make_project(root: &Path) {
        fs::create_dir_all(root.join("game/images")).unwrap();
        fs::write(root.join("game/images/bg.png"), b"png").unwrap();
        fs::write(root.join("game/script.rpy"), "label start:\n    return\n").unwrap();
        fs::write(root.join("project.vnvmaker"), "{}").unwrap();
    }

    #[test]
    fn reads_ren_py_strings_with_escapes() {
        assert_eq!(extract_rpy_quoted(r#"    old "Say \"hi\"""#).as_deref(), Some(r#"Say "hi""#));
        assert_eq!(extract_rpy_quoted(r#"    # s "a\\b\nc""#).as_deref(), Some("a\\b\nc"));
        assert_eq!(extract_rpy_quoted(r#"    new "unterminated"#), None);
        assert_eq!(extract_rpy_quoted("    pass"), None);
    }

    /// An SDK folder with every platform's launcher in it, like the real one.
    fn make_sdk(dir: &Path) {
        fs::create_dir_all(dir).unwrap();
        for name in ["renpy.exe", "renpy.sh", "renpy.py"] {
            fs::write(dir.join(name), "").unwrap();
        }
    }

    #[test]
    fn picks_the_renpy_launcher_for_this_platform() {
        let dir = temp_dir("sdk");
        let sdk = dir.join("renpy-8.5.2-sdk");
        make_sdk(&sdk);
        let expected = Some(sdk.join(if cfg!(windows) { "renpy.exe" } else { "renpy.sh" }));
        assert_eq!(renpy_launcher_from_hint(sdk.to_str().unwrap()), expected);
        // Picking either launcher leads to the one this platform can run.
        for name in ["renpy.exe", "renpy.sh"] {
            assert_eq!(renpy_launcher_from_hint(sdk.join(name).to_str().unwrap()), expected);
        }
        // Nothing else is ever started, even from inside the SDK.
        assert_eq!(renpy_launcher_from_hint(sdk.join("renpy.py").to_str().unwrap()), None);
        assert_eq!(renpy_launcher_from_hint(dir.join("missing").to_str().unwrap()), None);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn finds_the_newest_sdk_in_a_folder() {
        let dir = temp_dir("sdk-search");
        make_sdk(&dir.join("renpy-8.3.7-sdk"));
        make_sdk(&dir.join("renpy-8.5.2-sdk"));
        fs::create_dir_all(dir.join("renpy-notes")).unwrap();
        fs::create_dir_all(dir.join("other")).unwrap();
        let launcher = find_renpy_sdk_in(&[dir.join("missing"), dir.clone()]).unwrap();
        assert_eq!(launcher.parent(), Some(dir.join("renpy-8.5.2-sdk").as_path()));
        assert_eq!(find_renpy_sdk_in(&[dir.join("other")]), None);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn recognises_projects() {
        let dir = temp_dir("projects");
        let project = dir.join("Project");
        make_project(&project);
        assert!(looks_like_project(&project));
        assert!(!looks_like_project(&dir));
        assert!(!looks_like_project(&project.join("game")));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn checks_extensions_case_insensitively() {
        assert!(has_extension(Path::new("a/b/script.rpy"), "rpy"));
        assert!(has_extension(Path::new("a/b/SCRIPT.RPY"), "rpy"));
        assert!(!has_extension(Path::new("a/b/evil.bat"), "rpy"));
        assert!(!has_extension(Path::new("a/b/rpy"), "rpy"));
        assert!(has_extension(Path::new("p/project.vnvmaker"), "vnvmaker"));
    }

    #[test]
    fn only_deletes_files_the_app_manages() {
        let dir = temp_dir("delete");
        let project = dir.join("Project");
        make_project(&project);
        assert!(is_deletable_project_file(&project.join("game/images/bg.png")));
        assert!(is_deletable_project_file(&project.join("game/script.rpy")));
        assert!(is_deletable_project_file(&project.join("project.vnvmaker")));
        assert!(!is_deletable_project_file(&dir.join("notes.txt")));
        assert!(!is_deletable_project_file(&dir.join("project.vnvmaker")));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn empty_or_missing_folders() {
        let dir = temp_dir("empty");
        assert!(dir_is_empty_or_missing(&dir));
        assert!(dir_is_empty_or_missing(&dir.join("missing")));
        fs::write(dir.join("file.txt"), "x").unwrap();
        assert!(!dir_is_empty_or_missing(&dir));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn copies_a_project_but_never_into_itself() {
        let dir = temp_dir("copy");
        let project = dir.join("Project");
        make_project(&project);
        copy_dir_all(&project, &dir.join("Copy")).unwrap();
        assert!(dir.join("Copy/game/images/bg.png").is_file());
        assert!(copy_dir_all(&project, &project).is_err());
        assert!(copy_dir_all(&project, &project.join("game/nested")).is_err());
        assert_eq!(fs::read(project.join("game/images/bg.png")).unwrap(), b"png");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn scaffold_refuses_existing_folders() {
        let dir = temp_dir("scaffold");
        let template = dir.join("template/game");
        fs::create_dir_all(template.join("gui")).unwrap();
        fs::write(template.join("options.rpy"), "define config.name = _(\"Old\")\n").unwrap();
        let fresh = dir.join("Fresh");
        scaffold_from_template(&template, &fresh, "My Game").unwrap();
        assert!(fs::read_to_string(fresh.join("game/options.rpy")).unwrap().contains("_(\"My Game\")"));
        assert!(fresh.join("game/images").is_dir());
        // A second project with the same folder must not overwrite the first.
        assert!(scaffold_from_template(&template, &fresh, "Other").is_err());
        assert!(fs::read_to_string(fresh.join("game/options.rpy")).unwrap().contains("_(\"My Game\")"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn scaffold_writes_titles_ren_py_can_parse() {
        let dir = temp_dir("title");
        let template = dir.join("template/game");
        fs::create_dir_all(&template).unwrap();
        fs::write(
            template.join("options.rpy"),
            "define config.name = _(\"Templet\")\ndefine build.name = \"Templet\"\n",
        )
        .unwrap();
        let project = dir.join("Quoted");
        scaffold_from_template(&template, &project, r#"Tom's "Big" $1 Game\"#).unwrap();
        let opts = fs::read_to_string(project.join("game/options.rpy")).unwrap();
        assert!(opts.contains(r#"define config.name = _("Tom's \"Big\" $1 Game\\")"#), "{}", opts);
        assert!(opts.contains(r#"define build.name = "TomsBig1Game""#), "{}", opts);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn simple_names_are_safe_for_build_name() {
        assert_eq!(simple_name("My Game: Part 2"), "MyGamePart2");
        assert_eq!(simple_name("my-game_2"), "my-game_2");
        assert_eq!(simple_name("日本語"), "game");
    }

    #[test]
    fn applies_the_wizard_theme_to_the_template() {
        let dir = temp_dir("theme");
        let game = dir.join("Project/game");
        fs::create_dir_all(&game).unwrap();
        fs::write(
            game.join("gui.rpy"),
            "init python:\n    gui.init(1920, 1080)\n\
             define gui.accent_color = '#0099cc'\n\
             define gui.hover_color = '#66c1e0'\n\
             define gui.muted_color = '#003d51'\n\
             define gui.hover_muted_color = '#005b7a'\n",
        )
        .unwrap();
        fs::write(game.join("options.rpy"), "define config.save_directory = \"Templet-1\"\n").unwrap();

        apply_project_settings(&dir.join("Project"), 1280, 720, "#ff0000", "#000000").unwrap();
        let gui = fs::read_to_string(game.join("gui.rpy")).unwrap();
        assert!(gui.contains("gui.init(1280, 720)"), "{}", gui);
        assert!(gui.contains("define gui.accent_color = '#ff0000'"), "{}", gui);
        assert!(gui.contains("define gui.hover_color = '#ff6666'"), "{}", gui);
        assert!(gui.contains("define gui.muted_color = '#400000'"), "{}", gui);
        assert!(gui.contains("define gui.hover_muted_color = '#660000'"), "{}", gui);
        let opts = fs::read_to_string(game.join("options.rpy")).unwrap();
        assert!(opts.starts_with("define config.save_directory = \"Project-"), "{}", opts);

        // Anything that isn't a #rrggbb color leaves the colors alone.
        apply_project_settings(&dir.join("Project"), 1280, 720, "'); import os #", "nope").unwrap();
        assert_eq!(fs::read_to_string(game.join("gui.rpy")).unwrap(), gui);
        fs::remove_dir_all(&dir).unwrap();
    }
}
