const fs = require('fs');
const path = require('path');

const files = [
  'src/SceneEditor.tsx',
];

for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  if (!c.includes('ToastManager')) {
    const needle = 'import { launchRenpyPreview, findRenpySdk, DEFAULT_RENPY_SDK } from "./tauriApi";';
    c = c.replace(needle, needle + '\nimport { ToastManager } from "./toastContext";');
    fs.writeFileSync(f, c);
    console.log('Patched: ' + f);
  } else {
    console.log('Already has ToastManager: ' + f);
  }
}
