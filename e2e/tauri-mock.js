// Stand-in for Tauri's IPC, so the built frontend runs in a plain browser.
// Injected into every page before the app's own scripts (see fixtures.ts).
//
// A test configures it through window.__VNV_MOCK__, set by an earlier init script:
//   project        a VNProject listed in the games folder and returned by load_vnv_project
//   files          file contents read_rpy_file returns, keyed by path suffix (e.g. "game/gui.rpy")
//   assets         paths list_asset_files returns, keyed by asset type (e.g. { audio: ["audio/theme.ogg"] })
//   dialogAnswers  replies to plugin:dialog|message, in order ("Cancel" once they run out)
//
// Every call is recorded in window.__calls as [command, args], dialogs in
// window.__dialogs, and Content-Security-Policy violations in window.__cspViolations.
(() => {
  const config = window.__VNV_MOCK__ || {};
  const answers = [...(config.dialogAnswers || [])];
  const files = config.files || {};
  const assets = config.assets || {};
  const project = config.project || null;
  const projectDir = project ? `C:/Users/tester/Documents/VNVMaker/games/${project.title}` : null;

  window.__calls = [];
  window.__dialogs = [];
  window.__cspViolations = [];
  document.addEventListener("securitypolicyviolation", (e) => {
    window.__cspViolations.push({ directive: e.violatedDirective, blocked: e.blockedURI, sample: e.sample });
  });

  let nextId = 1;
  const readFile = (path) => {
    const key = Object.keys(files).find((suffix) => path.replace(/\\/g, "/").endsWith(suffix));
    return key === undefined ? "" : files[key];
  };

  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
    plugins: {},
    convertFileSrc: (path, protocol = "asset") => `http://${protocol}.localhost/${encodeURIComponent(path)}`,
    transformCallback: (callback) => {
      const id = nextId++;
      window[`_${id}`] = callback;
      return id;
    },
    unregisterCallback: () => {},
    invoke: async (cmd, args) => {
      window.__calls.push([cmd, args]);
      switch (cmd) {
        case "plugin:path|resolve_directory":
          return "C:\\Users\\tester\\Documents";
        case "list_dir_entries":
          return project ? [{ name: project.title, path: projectDir, is_dir: true, is_vnv_project: true }] : [];
        case "load_vnv_project":
          if (project && args.path.startsWith(projectDir)) return JSON.stringify(project);
          throw new Error(`No project at ${args.path}`);
        case "path_exists":
          return project !== null && args.path.startsWith(projectDir);
        case "dir_has_files":
          return false;
        case "find_renpy_sdk":
          return null;
        case "list_asset_files":
          return assets[args.assetType] || [];
        case "get_rpy_files":
          return [];
        case "scan_tl_translations":
          return {};
        case "read_rpy_file":
          return readFile(args.path);
        case "plugin:event|listen":
          return nextId++;
        case "plugin:dialog|message": {
          window.__dialogs.push(args);
          return answers.length > 0 ? answers.shift() : "Cancel";
        }
        default:
          return null;
      }
    },
  };
})();
