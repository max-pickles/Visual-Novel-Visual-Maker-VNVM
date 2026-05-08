/**
 * renpySemanticTokens.ts
 * Semantic token scanner for Ren'Py source text.
 * Ported from legacy IDE — stripped Monaco type imports so it runs anywhere.
 * Returns a Uint32Array in LSP delta-encoded format for Monaco, or use the
 * raw tokens array for other editors.
 */

export const SEMANTIC_TOKEN_TYPES = [
  'renpyLabel',            // 0 — known label reference
  'renpyLabelUndefined',   // 1 — undefined label reference
  'renpyCharacter',        // 2 — known character in dialogue
  'renpyCharacterUnknown', // 3 — unknown character in dialogue
  'renpyImage',            // 4 — known image name
  'renpyImageUnknown',     // 5 — unknown image name
  'renpyScreen',           // 6 — known screen name
  'renpyScreenUnknown',    // 7 — unknown screen name
  'renpyVariable',         // 8 — known variable
] as const;

export const SEMANTIC_TOKEN_MODIFIERS: string[] = [];

export const SEMANTIC_TOKEN_LEGEND = {
  tokenTypes: [...SEMANTIC_TOKEN_TYPES],
  tokenModifiers: SEMANTIC_TOKEN_MODIFIERS,
};

const T_LABEL = 0; const T_LABEL_UNDEF = 1;
const T_CHARACTER = 2; const T_CHARACTER_UNK = 3;
const T_IMAGE = 4; const T_IMAGE_UNK = 5;
const T_SCREEN = 6; const T_SCREEN_UNK = 7;
const T_VARIABLE = 8;

const RE_JUMP_CALL   = /\b(jump|call)\s+(?!screen\b|expression\b)([a-zA-Z_][a-zA-Z0-9_.]*)/g;
const RE_SCREEN_REF  = /\b(?:call|show|hide)\s+screen\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
const RE_IMAGE_STMT  = /\b(show|scene|hide)\s+(?!screen\b)([a-zA-Z_][a-zA-Z0-9_ ]*?)(?=\s+(?:at|with|as|behind|onlayer|zorder)|$)/g;
const RE_CHAR_DLG    = /^(\s+)([a-zA-Z_]\w*)\s+"/;
const RE_INLINE_PY   = /^\s*\$\s+(.+)$/;
const RE_IDENTIFIER  = /\b([a-zA-Z_]\w*)\b/g;

const STATEMENT_KEYWORDS = new Set([
  'show','hide','scene','play','queue','stop','pause','with','window',
  'define','default','init','label','jump','call','return','if','elif',
  'else','for','while','pass','menu','image','transform','style','screen',
  'python','translate','nvl','voice','renpy','config','gui','at','as',
  'behind','onlayer','zorder','expression','extend','camera',
]);
const PYTHON_NOISE = new Set([
  'True','False','None','and','or','not','in','is','if','else',
  'for','while','return','import','from','class','def','lambda',
  'try','except','finally','raise','with','as','del','print','len',
  'range','int','str','float','list','dict','tuple','set','type',
  'isinstance','super','self','renpy','config','gui','persistent','store','im','ui',
]);

export interface SemanticAnalysisData {
  labels: Record<string, unknown>;
  characters: Map<string, unknown>;
  definedImages: Set<string>;
  screens: Map<string, unknown>;
  variables: Map<string, unknown>;
}

interface RawToken { line: number; char: number; length: number; type: number; }

/**
 * Scan a document and return semantic tokens as a delta-encoded Uint32Array (for Monaco).
 */
export function computeSemanticTokens(
  text: string,
  analysis: SemanticAnalysisData,
): Uint32Array {
  const tokens: RawToken[] = [];
  const lines = text.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    RE_JUMP_CALL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE_JUMP_CALL.exec(line)) !== null) {
      const label = m[2];
      const col = m.index + m[0].indexOf(label);
      tokens.push({ line: lineIdx, char: col, length: label.length, type: label in analysis.labels ? T_LABEL : T_LABEL_UNDEF });
    }

    RE_SCREEN_REF.lastIndex = 0;
    while ((m = RE_SCREEN_REF.exec(line)) !== null) {
      const name = m[1];
      const col = m.index + m[0].indexOf(name);
      tokens.push({ line: lineIdx, char: col, length: name.length, type: analysis.screens.has(name) ? T_SCREEN : T_SCREEN_UNK });
    }

    RE_IMAGE_STMT.lastIndex = 0;
    while ((m = RE_IMAGE_STMT.exec(line)) !== null) {
      const imageName = m[2].trim();
      if (!imageName) continue;
      const col = m.index + m[0].indexOf(m[2]);
      const firstTag = imageName.split(/\s+/)[0];
      tokens.push({ line: lineIdx, char: col, length: imageName.length, type: (analysis.definedImages.has(imageName) || analysis.definedImages.has(firstTag)) ? T_IMAGE : T_IMAGE_UNK });
    }

    const charMatch = RE_CHAR_DLG.exec(line);
    if (charMatch) {
      const tag = charMatch[2];
      if (!STATEMENT_KEYWORDS.has(tag)) {
        tokens.push({ line: lineIdx, char: charMatch[1].length, length: tag.length, type: analysis.characters.has(tag) ? T_CHARACTER : T_CHARACTER_UNK });
      }
    }

    const pyMatch = RE_INLINE_PY.exec(line);
    if (pyMatch) {
      const expr = pyMatch[1];
      const exprStart = line.indexOf(expr, line.indexOf('$') + 1);
      RE_IDENTIFIER.lastIndex = 0;
      let idM: RegExpExecArray | null;
      while ((idM = RE_IDENTIFIER.exec(expr)) !== null) {
        const ident = idM[1];
        if (PYTHON_NOISE.has(ident)) continue;
        if (analysis.variables.has(ident) || analysis.characters.has(ident)) {
          tokens.push({ line: lineIdx, char: exprStart + idM.index, length: ident.length, type: T_VARIABLE });
        }
      }
    }
  }

  tokens.sort((a, b) => a.line - b.line || a.char - b.char);

  const data = new Uint32Array(tokens.length * 5);
  let prevLine = 0; let prevChar = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const deltaLine = t.line - prevLine;
    const deltaChar = deltaLine === 0 ? t.char - prevChar : t.char;
    const offset = i * 5;
    data[offset]     = deltaLine;
    data[offset + 1] = deltaChar;
    data[offset + 2] = t.length;
    data[offset + 3] = t.type;
    data[offset + 4] = 0;
    prevLine = t.line; prevChar = t.char;
  }
  return data;
}

/** Theme colour rules for dark mode. */
export const SEMANTIC_DARK_RULES = [
  { token: 'renpyLabel',            foreground: '61AFEF', fontStyle: 'underline' },
  { token: 'renpyCharacter',        foreground: 'E5C07B', fontStyle: 'bold' },
  { token: 'renpyImage',            foreground: '98C379' },
  { token: 'renpyScreen',           foreground: '61AFEF' },
  { token: 'renpyVariable',         foreground: 'E06C75' },
  { token: 'renpyLabelUndefined',   foreground: 'E06C75', fontStyle: 'underline' },
  { token: 'renpyCharacterUnknown', foreground: 'ABB2BF', fontStyle: 'italic' },
  { token: 'renpyImageUnknown',     foreground: 'ABB2BF', fontStyle: 'italic' },
  { token: 'renpyScreenUnknown',    foreground: 'ABB2BF', fontStyle: 'italic' },
];

/** Theme colour rules for light mode. */
export const SEMANTIC_LIGHT_RULES = [
  { token: 'renpyLabel',            foreground: '4078F2', fontStyle: 'underline' },
  { token: 'renpyCharacter',        foreground: 'C18401', fontStyle: 'bold' },
  { token: 'renpyImage',            foreground: '50A14F' },
  { token: 'renpyScreen',           foreground: '4078F2' },
  { token: 'renpyVariable',         foreground: 'E45649' },
  { token: 'renpyLabelUndefined',   foreground: 'E45649', fontStyle: 'underline' },
  { token: 'renpyCharacterUnknown', foreground: 'A0A1A7', fontStyle: 'italic' },
  { token: 'renpyImageUnknown',     foreground: 'A0A1A7', fontStyle: 'italic' },
  { token: 'renpyScreenUnknown',    foreground: 'A0A1A7', fontStyle: 'italic' },
];
