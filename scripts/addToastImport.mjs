import fs from 'fs';

const f = 'src/SceneEditor.tsx';
let c = fs.readFileSync(f, 'utf8');
if (!c.includes('ToastManager')) {
  // Find the tauriApi import line and append the ToastManager import after it
  const lines = c.split('\n');
  const idx = lines.findIndex(l => l.includes('./tauriApi') && l.includes('launchRenpyPreview'));
  if (idx !== -1) {
    lines.splice(idx + 1, 0, 'import { ToastManager } from "./toastContext";');
    fs.writeFileSync(f, lines.join('\n'));
    console.log('Patched SceneEditor.tsx with ToastManager import');
  } else {
    console.log('Could not find insertion point');
  }
} else {
  console.log('Already imported');
}
