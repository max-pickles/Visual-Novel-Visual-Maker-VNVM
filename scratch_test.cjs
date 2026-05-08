const fs = require('fs');
const txt = fs.readFileSync('C:/Users/maxcm/OneDrive/Desktop/VNVMAKER/games/The question/game/tl/japanese/script.rpy', 'utf8');

let o = null;
let p = {};

for (const l of txt.split('\n')) {
  const t = l.trim();
  if (t.startsWith('# ') && !o) {
    let q = t.indexOf('"');
    if (q >= 0) {
      let inner = t.substring(q + 1);
      let e = inner.indexOf('"');
      o = inner.substring(0, e);
    }
    continue;
  }
  if (!t.startsWith('#') && t) {
    if (o) {
      let q = t.indexOf('"');
      if (q >= 0) {
        let inner = t.substring(q + 1);
        let e = inner.indexOf('"');
        let tr = inner.substring(0, e);
        if (tr !== o) p[o] = tr;
      }
    }
    o = null;
  }
}
console.log("Translation map size:", Object.keys(p).length);
console.log("Translation for 'You know you could never disappoint me, Sylvie.':", p['You know you could never disappoint me, Sylvie.']);
