/**
 * colorPalettes.ts — Static color palette data.
 * Ported from bmf-vangard-renpy-ide-main/lib/colorPalettes.ts
 * Zero dependencies — pure TypeScript data + one utility function.
 */

export interface PaletteColor {
  hex: string;
  name: string;
}

export interface ColorPalette {
  id: string;
  label: string;
  colors: PaletteColor[];
}

/** Ren'Py Standard — colors commonly used for dialogue text tags */
const RENPY_STANDARD: ColorPalette = {
  id: "renpy_standard",
  label: "Ren'Py Standard",
  colors: [
    { hex: "#FFFFFF", name: "White" },       { hex: "#F0F0F0", name: "Off White" },
    { hex: "#D3D3D3", name: "Light Gray" },  { hex: "#A9A9A9", name: "Dark Gray" },
    { hex: "#808080", name: "Gray" },         { hex: "#000000", name: "Black" },
    { hex: "#FF0000", name: "Red" },          { hex: "#FF4444", name: "Light Red" },
    { hex: "#FF8888", name: "Salmon Red" },   { hex: "#FF6347", name: "Tomato" },
    { hex: "#DC143C", name: "Crimson" },      { hex: "#8B0000", name: "Dark Red" },
    { hex: "#FF69B4", name: "Hot Pink" },     { hex: "#FFB6C1", name: "Light Pink" },
    { hex: "#FF1493", name: "Deep Pink" },    { hex: "#FFA500", name: "Orange" },
    { hex: "#FF8C00", name: "Dark Orange" },  { hex: "#FFD700", name: "Gold" },
    { hex: "#FFFF00", name: "Yellow" },       { hex: "#ADFF2F", name: "Green Yellow" },
    { hex: "#00FF00", name: "Lime" },         { hex: "#00C800", name: "Bright Green" },
    { hex: "#008000", name: "Green" },        { hex: "#006400", name: "Dark Green" },
    { hex: "#00FFFF", name: "Cyan" },         { hex: "#00CED1", name: "Dark Turquoise" },
    { hex: "#20B2AA", name: "Light Sea Green" }, { hex: "#1E90FF", name: "Dodger Blue" },
    { hex: "#4169E1", name: "Royal Blue" },   { hex: "#0000FF", name: "Blue" },
    { hex: "#00008B", name: "Dark Blue" },    { hex: "#8A2BE2", name: "Blue Violet" },
    { hex: "#9400D3", name: "Dark Violet" },  { hex: "#EE82EE", name: "Violet" },
    { hex: "#DA70D6", name: "Orchid" },       { hex: "#C0C0C0", name: "Silver" },
  ],
};

/** Pastel — soft muted tones popular in visual novel UIs */
const PASTEL: ColorPalette = {
  id: "pastel",
  label: "Pastel",
  colors: [
    { hex: "#FFB3BA", name: "Pastel Red" },     { hex: "#FFDFBA", name: "Pastel Orange" },
    { hex: "#FFFFBA", name: "Pastel Yellow" },   { hex: "#BAFFC9", name: "Pastel Green" },
    { hex: "#BAE1FF", name: "Pastel Blue" },     { hex: "#E8BAFF", name: "Pastel Violet" },
    { hex: "#FFC8DD", name: "Pastel Pink" },     { hex: "#BDE0FE", name: "Pastel Sky" },
    { hex: "#A2D2FF", name: "Pastel Cornflower" }, { hex: "#CDB4DB", name: "Pastel Lilac" },
    { hex: "#FFC8A2", name: "Pastel Peach" },    { hex: "#D4E157", name: "Pastel Lime" },
    { hex: "#80DEEA", name: "Pastel Cyan" },     { hex: "#F48FB1", name: "Pastel Rose" },
    { hex: "#CE93D8", name: "Pastel Plum" },     { hex: "#90CAF9", name: "Pastel Periwinkle" },
    { hex: "#A5D6A7", name: "Pastel Mint" },     { hex: "#FFF9C4", name: "Pastel Cream" },
    { hex: "#FFE4E1", name: "Misty Rose" },      { hex: "#F0E6FF", name: "Lavender Mist" },
    { hex: "#E6F4FF", name: "Ice Blue" },        { hex: "#E6FFE6", name: "Mint Cream" },
    { hex: "#F3E5F5", name: "Orchid Tint" },     { hex: "#FCE4EC", name: "Cherry Blossom" },
    { hex: "#E8EAF6", name: "Indigo Tint" },     { hex: "#E0F2F1", name: "Seafoam Tint" },
  ],
};

/** Material Design 500 weights */
const MATERIAL_500: ColorPalette = {
  id: "material_500",
  label: "Material 500",
  colors: [
    { hex: "#F44336", name: "Red" },       { hex: "#E91E63", name: "Pink" },
    { hex: "#9C27B0", name: "Purple" },    { hex: "#673AB7", name: "Deep Purple" },
    { hex: "#3F51B5", name: "Indigo" },    { hex: "#2196F3", name: "Blue" },
    { hex: "#03A9F4", name: "Light Blue" }, { hex: "#00BCD4", name: "Cyan" },
    { hex: "#009688", name: "Teal" },      { hex: "#4CAF50", name: "Green" },
    { hex: "#8BC34A", name: "Light Green" }, { hex: "#CDDC39", name: "Lime" },
    { hex: "#FFEB3B", name: "Yellow" },    { hex: "#FFC107", name: "Amber" },
    { hex: "#FF9800", name: "Orange" },    { hex: "#FF5722", name: "Deep Orange" },
    { hex: "#795548", name: "Brown" },     { hex: "#9E9E9E", name: "Grey" },
    { hex: "#607D8B", name: "Blue Grey" }, { hex: "#FFCDD2", name: "Red 100" },
    { hex: "#F8BBD0", name: "Pink 100" },  { hex: "#E1BEE7", name: "Purple 100" },
    { hex: "#BBDEFB", name: "Blue 100" },  { hex: "#B2EBF2", name: "Cyan 100" },
    { hex: "#C8E6C9", name: "Green 100" }, { hex: "#FFF9C4", name: "Yellow 100" },
    { hex: "#B71C1C", name: "Red 900" },   { hex: "#1A237E", name: "Indigo 900" },
    { hex: "#0D47A1", name: "Blue 900" },  { hex: "#1B5E20", name: "Green 900" },
  ],
};

/** HTML Named Colors — CSS Level 1/2/3 named colors (subset) */
const HTML_NAMED: ColorPalette = {
  id: "html_named",
  label: "HTML Named",
  colors: [
    { hex: "#F0F8FF", name: "AliceBlue" },    { hex: "#FAEBD7", name: "AntiqueWhite" },
    { hex: "#00FFFF", name: "Aqua" },          { hex: "#7FFFD4", name: "Aquamarine" },
    { hex: "#000000", name: "Black" },         { hex: "#0000FF", name: "Blue" },
    { hex: "#8A2BE2", name: "BlueViolet" },   { hex: "#A52A2A", name: "Brown" },
    { hex: "#7FFF00", name: "Chartreuse" },    { hex: "#D2691E", name: "Chocolate" },
    { hex: "#FF7F50", name: "Coral" },         { hex: "#6495ED", name: "CornflowerBlue" },
    { hex: "#DC143C", name: "Crimson" },       { hex: "#00FFFF", name: "Cyan" },
    { hex: "#006400", name: "DarkGreen" },     { hex: "#FF8C00", name: "DarkOrange" },
    { hex: "#9400D3", name: "DarkViolet" },   { hex: "#FF1493", name: "DeepPink" },
    { hex: "#1E90FF", name: "DodgerBlue" },   { hex: "#B22222", name: "FireBrick" },
    { hex: "#228B22", name: "ForestGreen" },  { hex: "#FF00FF", name: "Fuchsia" },
    { hex: "#FFD700", name: "Gold" },          { hex: "#808080", name: "Gray" },
    { hex: "#008000", name: "Green" },         { hex: "#ADFF2F", name: "GreenYellow" },
    { hex: "#FF69B4", name: "HotPink" },      { hex: "#4B0082", name: "Indigo" },
    { hex: "#F0E68C", name: "Khaki" },         { hex: "#E6E6FA", name: "Lavender" },
    { hex: "#7CFC00", name: "LawnGreen" },    { hex: "#ADD8E6", name: "LightBlue" },
    { hex: "#90EE90", name: "LightGreen" },   { hex: "#D3D3D3", name: "LightGray" },
    { hex: "#FFB6C1", name: "LightPink" },    { hex: "#20B2AA", name: "LightSeaGreen" },
    { hex: "#00FF00", name: "Lime" },          { hex: "#32CD32", name: "LimeGreen" },
    { hex: "#FF00FF", name: "Magenta" },       { hex: "#800000", name: "Maroon" },
    { hex: "#0000CD", name: "MediumBlue" },   { hex: "#800080", name: "Purple" },
    { hex: "#FF0000", name: "Red" },           { hex: "#FA8072", name: "Salmon" },
    { hex: "#C0C0C0", name: "Silver" },        { hex: "#00FF7F", name: "SpringGreen" },
    { hex: "#4682B4", name: "SteelBlue" },    { hex: "#008080", name: "Teal" },
    { hex: "#FF6347", name: "Tomato" },        { hex: "#40E0D0", name: "Turquoise" },
    { hex: "#EE82EE", name: "Violet" },        { hex: "#FFFFFF", name: "White" },
    { hex: "#FFFF00", name: "Yellow" },        { hex: "#9ACD32", name: "YellowGreen" },
  ],
};

export const BUILT_IN_PALETTES: ColorPalette[] = [
  RENPY_STANDARD,
  PASTEL,
  MATERIAL_500,
  HTML_NAMED,
];

/** Expand 3-digit hex shorthand (#abc → #aabbcc). */
export function expandHex(hex: string): string {
  const trimmed = hex.replace(/^#/, "");
  if (trimmed.length === 3) {
    return "#" + trimmed.split("").map((c) => c + c).join("");
  }
  return hex.toUpperCase().startsWith("#") ? hex.toUpperCase() : "#" + hex.toUpperCase();
}

/** Returns a contrasting text color (black or white) based on perceived luminance. */
export function contrastColor(hex: string): string {
  const h = expandHex(hex).replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? "#1a1a1a" : "#ffffff";
}
