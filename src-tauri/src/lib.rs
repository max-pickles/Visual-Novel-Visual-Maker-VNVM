// VNVMaker — Rust core
// Lean, fast Ren'Py project parser and save system.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

use uuid::Uuid;
use walkdir::WalkDir;
use regex::Regex;

// ─── Legacy Read-Only Types (Ren'Py parser) ───────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneNode {
    pub id: String,
    pub label: String,
    pub kind: NodeKind,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub file_path: String,
    pub line_number: usize,
    pub links: Vec<NodeLink>,
    pub content: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Label,
    Menu,
    Init,
    Screen,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeLink {
    pub target_label: String,
    pub link_type: LinkType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LinkType {
    Jump,
    Call,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpyProject {
    pub root_path: String,
    pub nodes: Vec<SceneNode>,
    pub files: Vec<String>,
}

// ─── Ren'Py Parser ────────────────────────────────────────────────────────────

pub fn parse_renpy_project(root: &Path) -> Result<RpyProject, String> {
    let mut nodes: Vec<SceneNode> = Vec::new();
    let mut rpy_files: Vec<String> = Vec::new();

    // Files we never want to treat as story content
    let skip_files = [
        "screens.rpy", "gui.rpy", "options.rpy", "styles.rpy",
        "testcases.rpy", "guisupport.rpy", "accessibility.rpy",
    ];
    // Subdirectories that contain only non-story files
    let skip_dirs = ["cache", "tl", "gui", "vn_maker", ".vscode"];

    for entry in WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "rpy"))
    {
        let path = entry.path().to_path_buf();
        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");

        // Skip files by name
        let fname = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
        if skip_files.iter().any(|s| fname == *s) { continue; }

        // Skip files inside blacklisted directories
        let parts: Vec<&str> = rel.split('/').collect();
        if parts.iter().any(|p| skip_dirs.contains(p)) { continue; }

        rpy_files.push(rel.clone());
        let file_nodes = parse_rpy_file(&path, &rel)?;

        // Only keep story nodes: Labels only (no Screen, Init, Unknown)
        // Also filter out VNVMaker internal labels (vn_, vns_, _vn)
        for node in file_nodes {
            if node.kind != NodeKind::Label { continue; }
            let lbl = &node.label;
            if lbl.starts_with("vn_") || lbl.starts_with("vns_") || lbl.starts_with("_vn") { continue; }
            nodes.push(node);
        }
    }

    let cols = 4usize;
    let h_gap = 280.0f64;
    let v_gap = 180.0f64;
    for (i, node) in nodes.iter_mut().enumerate() {
        node.x = (i % cols) as f64 * h_gap + 40.0;
        node.y = (i / cols) as f64 * v_gap + 40.0;
    }

    Ok(RpyProject {
        root_path: root.to_string_lossy().into_owned(),
        nodes,
        files: rpy_files,
    })
}


fn parse_rpy_file(path: &Path, rel_path: &str) -> Result<Vec<SceneNode>, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Could not read {}: {}", rel_path, e))?;

    let label_re = Regex::new(r"^label\s+(\w+)\s*(\(.*\))?\s*:").unwrap();
    let menu_re  = Regex::new(r"^\s*menu\s*(\w+)?\s*:").unwrap();
    let init_re  = Regex::new(r"^init\s*(-?\d+)?\s*:").unwrap();
    let screen_re= Regex::new(r"^screen\s+(\w+)\s*").unwrap();
    let jump_re  = Regex::new(r"\bjump\s+(\w+)").unwrap();
    let call_re  = Regex::new(r"\bcall\s+(\w+)").unwrap();

    let lines: Vec<&str> = content.lines().collect();
    let mut nodes: Vec<SceneNode> = Vec::new();
    let mut current_node: Option<SceneNode> = None;
    let mut current_indent: usize = 0;

    let get_indent = |line: &str| line.len() - line.trim_start().len();

    for (line_num, &line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            if let Some(ref mut n) = current_node {
                n.content.push(line.to_string());
            }
            continue;
        }

        let indent = get_indent(line);

        let new_node: Option<(String, NodeKind)> = if let Some(cap) = label_re.captures(trimmed) {
            Some((cap[1].to_string(), NodeKind::Label))
        } else if menu_re.is_match(trimmed) && indent == 0 {
            Some((format!("menu_{}", line_num + 1), NodeKind::Menu))
        } else if init_re.is_match(trimmed) && indent == 0 {
            Some((format!("init_{}", line_num + 1), NodeKind::Init))
        } else if let Some(cap) = screen_re.captures(trimmed) {
            Some((cap[1].to_string(), NodeKind::Screen))
        } else {
            None
        };

        if let Some((label, kind)) = new_node {
            if let Some(finished) = current_node.take() {
                nodes.push(finished);
            }
            current_indent = indent;
            current_node = Some(SceneNode {
                id: Uuid::new_v4().to_string(),
                label,
                kind,
                x: 0.0,
                y: 0.0,
                width: 220.0,
                height: 120.0,
                file_path: rel_path.to_string(),
                line_number: line_num + 1,
                links: Vec::new(),
                content: vec![line.to_string()],
            });
        } else if let Some(ref mut node) = current_node {
            if indent > current_indent || trimmed.starts_with('$') || trimmed.starts_with('"') {
                for cap in jump_re.captures_iter(trimmed) {
                    node.links.push(NodeLink {
                        target_label: cap[1].to_string(),
                        link_type: LinkType::Jump,
                    });
                }
                for cap in call_re.captures_iter(trimmed) {
                    node.links.push(NodeLink {
                        target_label: cap[1].to_string(),
                        link_type: LinkType::Call,
                    });
                }
                node.content.push(line.to_string());
                node.height = (80.0 + node.content.len() as f64 * 14.0).min(300.0);
            } else {
                let finished = current_node.take().unwrap();
                nodes.push(finished);
            }
        }
    }

    if let Some(n) = current_node {
        nodes.push(n);
    }

    Ok(nodes)
}

// ─── Save / Positions ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct LayoutData {
    pub positions: HashMap<String, [f64; 2]>,
}

pub fn save_layout(root: &Path, layout: &LayoutData) -> Result<(), String> {
    let path = root.join(".vnvmaker_layout.json");
    let json = serde_json::to_string_pretty(layout)
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn load_layout(root: &Path) -> LayoutData {
    let path = root.join(".vnvmaker_layout.json");
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| LayoutData { positions: HashMap::new() })
}

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

// ─── .rpy Importer ────────────────────────────────────────────────────────────

/// Minimal import: reads the folder structure and returns JSON that the
/// frontend compiler.ts can polish into a full VNProject.
/// Returns a JSON string representing { scenes, characters, warnings }.
pub fn import_rpy_folder(folder_path: &Path) -> Result<String, String> {
    use std::collections::HashMap;

    if !folder_path.exists() {
        return Err(format!("Folder not found: {:?}", folder_path));
    }

    let char_re = Regex::new(r#"^define\s+(\w+)\s*=\s*Character\s*\(\s*["']([^"']+)["']"#).unwrap();
    let label_re = Regex::new(r"^label\s+([\w.]+)\s*:").unwrap();
    let say_re = Regex::new(r#"^(\w+)\s+"(.*)""#).unwrap();
    let narr_re = Regex::new(r#"^"(.*)""#).unwrap();
    let jump_re = Regex::new(r"^jump\s+([\w.]+)").unwrap();
    let call_re = Regex::new(r"^call\s+([\w.]+)").unwrap();
    let menu_re = Regex::new(r"^menu\s*:").unwrap();
    let choice_re = Regex::new(r#"^"([^"]+)"\s*:"#).unwrap();
    let scene_bg_re = Regex::new(r"^scene\s+([\w/.\ \-]+)").unwrap();
    let play_re = Regex::new(r#"^play\s+music\s+["']([^"']+)["']"#).unwrap();

    let exclude_files = ["options.rpy", "gui.rpy", "screens.rpy", "guisupport.rpy"];
    let exclude_dirs = ["vn_maker", "cache", "tl"];

    let mut all_lines: Vec<(usize, String)> = Vec::new();
    for entry in WalkDir::new(folder_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |x| x == "rpy"))
    {
        let fname = entry.file_name().to_string_lossy().to_string();
        if exclude_files.contains(&fname.as_str()) { continue; }
        let parts: Vec<_> = entry.path().components().collect();
        if parts.iter().any(|p| exclude_dirs.contains(&p.as_os_str().to_str().unwrap_or(""))) { continue; }
        if let Ok(text) = std::fs::read_to_string(entry.path()) {
            // Strip translate blocks before adding to all_lines.
            // A translate block starts with `translate <lang> <label>:` (no leading indent)
            // and ends when a non-empty, non-indented line appears.
            let translate_block_re = Regex::new(r"^translate\s+\w+\s+").unwrap();
            let mut in_translate_block = false;
            let start = all_lines.len();
            for (i, line) in text.lines().enumerate() {
                let trimmed = line.trim();
                // Detect start of a translate block
                if !line.starts_with(' ') && !line.starts_with('\t') && !trimmed.is_empty() {
                    if translate_block_re.is_match(trimmed) {
                        in_translate_block = true;
                        continue;
                    } else {
                        // Back to top-level non-translate content
                        in_translate_block = false;
                    }
                }
                if in_translate_block { continue; }
                all_lines.push((start + i, line.to_string()));
            }
        }
    }

    // Parse characters
    let full_text: String = all_lines.iter().map(|(_, l)| l.as_str()).collect::<Vec<_>>().join("\n");
    let mut char_map: HashMap<String, serde_json::Value> = HashMap::new();
    for cap in char_re.captures_iter(&full_text) {
        let varname = cap[1].to_string();
        let charname = cap[2].to_string();
        let id = format!("{:08x}", varname.chars().map(|c| c as u32).sum::<u32>());
        char_map.insert(varname, serde_json::json!({
            "id": id, "name": charname, "display": charname,
            "color": "#c8d0ff", "sprites": {}, "poses": ["neutral","happy","sad","angry","surprised"]
        }));
    }

    // Parse scenes
    let mut scenes: Vec<serde_json::Value> = Vec::new();
    let mut current_scene: Option<serde_json::Value> = None;
    let mut in_menu = false;
    let mut menu_ev: Option<serde_json::Value> = None;
    let mut warnings: Vec<String> = Vec::new();

    let finish_menu = |current_scene: &mut Option<serde_json::Value>, in_menu: &mut bool, menu_ev: &mut Option<serde_json::Value>| {
        if *in_menu {
            if let (Some(sc), Some(ev)) = (current_scene.as_mut(), menu_ev.take()) {
                if let Some(evs) = sc["events"].as_array_mut() { evs.push(ev); }
            }
        }
        *in_menu = false;
        *menu_ev = None;
    };

    for (_, line) in &all_lines {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') { continue; }

        // Label
        if let Some(cap) = label_re.captures(trimmed) {
            finish_menu(&mut current_scene, &mut in_menu, &mut menu_ev);
            if let Some(sc) = current_scene.take() { scenes.push(sc); }
            let lbl = cap[1].to_string();
            let id = Uuid::new_v4().to_string()[..8].to_string();
            current_scene = Some(serde_json::json!({
                "id": id, "label": lbl, "bg": null, "music": null, "events": []
            }));
            continue;
        }

        let sc = match current_scene.as_mut() { Some(s) => s, None => continue };

        if let Some(cap) = scene_bg_re.captures(trimmed) {
            let bg = cap[1].trim().to_string();
            let ev_id = Uuid::new_v4().to_string()[..8].to_string();
            sc["events"].as_array_mut().unwrap().push(serde_json::json!({"id":ev_id,"type":"bg","bg":bg}));
            sc["bg"] = serde_json::json!(bg);
            continue;
        }
        if let Some(cap) = play_re.captures(trimmed) {
            let music = cap[1].to_string();
            let ev_id = Uuid::new_v4().to_string()[..8].to_string();
            sc["events"].as_array_mut().unwrap().push(serde_json::json!({"id":ev_id,"type":"music","music":music}));
            continue;
        }
        if menu_re.is_match(trimmed) {
            finish_menu(&mut current_scene, &mut in_menu, &mut menu_ev);
            let _sc = current_scene.as_mut().unwrap();
            in_menu = true;
            let ev_id = Uuid::new_v4().to_string()[..8].to_string();
            menu_ev = Some(serde_json::json!({"id":ev_id,"type":"choice","prompt":"","opts":[]}));
            continue;
        }
        if in_menu {
            if let Some(cap) = choice_re.captures(trimmed) {
                let opt_id = Uuid::new_v4().to_string()[..6].to_string();
                if let Some(ev) = menu_ev.as_mut() {
                    ev["opts"].as_array_mut().unwrap().push(serde_json::json!({"id":opt_id,"text":cap[1].to_string(),"scene":null}));
                }
                continue;
            }
            if let Some(cap) = jump_re.captures(trimmed) {
                let target = cap[1].to_string();
                if let Some(ev) = menu_ev.as_mut() {
                    if let Some(opts) = ev["opts"].as_array_mut() {
                        if let Some(last) = opts.last_mut() {
                            last["_target_lbl"] = serde_json::json!(target);
                        }
                    }
                }
                continue;
            }
        }

        if let Some(cap) = jump_re.captures(trimmed).or_else(|| call_re.captures(trimmed)) {
            finish_menu(&mut current_scene, &mut in_menu, &mut menu_ev);
            let sc = current_scene.as_mut().unwrap();
            let ev_id = Uuid::new_v4().to_string()[..8].to_string();
            sc["events"].as_array_mut().unwrap().push(serde_json::json!({
                "id": ev_id, "type": "jump", "scene_id": null, "_target_lbl": cap[1].to_string(), "transition": "dissolve"
            }));
            continue;
        }
        if let Some(cap) = say_re.captures(trimmed) {
            finish_menu(&mut current_scene, &mut in_menu, &mut menu_ev);
            let sc = current_scene.as_mut().unwrap();
            let varname = cap[1].to_string();
            let text = cap[2].to_string();
            let ev_id = Uuid::new_v4().to_string()[..8].to_string();
            if let Some(ch) = char_map.get(&varname) {
                sc["events"].as_array_mut().unwrap().push(serde_json::json!({
                    "id": ev_id, "type": "dialogue", "char_id": ch["id"], "pose": "neutral", "text": text, "side": "center"
                }));
            } else {
                sc["events"].as_array_mut().unwrap().push(serde_json::json!({
                    "id": ev_id, "type": "narration", "text": format!("{}: {}", varname, text)
                }));
            }
            continue;
        }
        if let Some(cap) = narr_re.captures(trimmed) {
            finish_menu(&mut current_scene, &mut in_menu, &mut menu_ev);
            let sc = current_scene.as_mut().unwrap();
            let ev_id = Uuid::new_v4().to_string()[..8].to_string();
            sc["events"].as_array_mut().unwrap().push(serde_json::json!({
                "id": ev_id, "type": "narration", "text": cap[1].to_string()
            }));
        }
    }
    finish_menu(&mut current_scene, &mut in_menu, &mut menu_ev);
    if let Some(sc) = current_scene { scenes.push(sc); }

    // Build label→id map and resolve jumps
    let mut label_to_id: HashMap<String, String> = HashMap::new();
    for sc in &scenes {
        label_to_id.insert(sc["label"].as_str().unwrap_or("").to_string(), sc["id"].as_str().unwrap_or("").to_string());
    }
    for sc in &mut scenes {
        if let Some(evs) = sc["events"].as_array_mut() {
            for ev in evs.iter_mut() {
                if ev["type"] == "jump" {
                    if let Some(lbl) = ev.get("_target_lbl").and_then(|v| v.as_str()).map(|s| s.to_string()) {
                        if let Some(sid) = label_to_id.get(&lbl) {
                            ev["scene_id"] = serde_json::json!(sid);
                        } else {
                            warnings.push(format!("Jump target '{}' not found", lbl));
                        }
                        if let Some(obj) = ev.as_object_mut() { obj.remove("_target_lbl"); }
                    }
                }
                if ev["type"] == "choice" {
                    if let Some(opts) = ev["opts"].as_array_mut() {
                        for opt in opts.iter_mut() {
                            if let Some(lbl) = opt.get("_target_lbl").and_then(|v| v.as_str()).map(|s| s.to_string()) {
                                if let Some(sid) = label_to_id.get(&lbl) {
                                    opt["scene"] = serde_json::json!(sid);
                                }
                                if let Some(obj) = opt.as_object_mut() { obj.remove("_target_lbl"); }
                            }
                        }
                    }
                }
            }
        }
    }

    let characters: Vec<serde_json::Value> = char_map.into_values().collect();
    warnings.insert(0, format!("Imported {} scenes, {} characters.", scenes.len(), characters.len()));

    let result = serde_json::json!({
        "scenes": scenes,
        "characters": characters,
        "warnings": warnings
    });
    serde_json::to_string(&result).map_err(|e| e.to_string())
}
