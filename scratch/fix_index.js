const fs = require('fs');

const indexPath = 'C:/Users/maxcm/OneDrive/Desktop/MEME KING/renpy-8.5.2-sdk/bmf-vangard-renpy-ide-main/index.tsx';
let indexCode = fs.readFileSync(indexPath, 'utf8');

if (!indexCode.includes('./lib/tauriAPI')) {
    indexCode = indexCode.replace(
        "import './index.css';",
        "import './index.css';\nimport './lib/tauriAPI';"
    );
    fs.writeFileSync(indexPath, indexCode);
    console.log('Successfully injected tauriAPI into index.tsx');
}
