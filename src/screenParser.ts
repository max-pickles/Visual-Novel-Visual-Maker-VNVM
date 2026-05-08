export interface ScreenConfig {
  main_menu_frame_xsize: number;
  game_menu_navigation_frame_xsize: number;
  main_menu_vbox_xalign: number;
  main_menu_vbox_yalign: number;
  main_menu_vbox_xoffset: number;
  main_menu_vbox_yoffset: number;
  main_menu_vbox_xsize: number;
  help_label_xsize: number;
}

const DEFAULT_CONFIG: ScreenConfig = {
  main_menu_frame_xsize: 280,
  game_menu_navigation_frame_xsize: 280,
  main_menu_vbox_xalign: 1.0,
  main_menu_vbox_yalign: 1.0,
  main_menu_vbox_xoffset: -20,
  main_menu_vbox_yoffset: -20,
  main_menu_vbox_xsize: 960,
  help_label_xsize: 250,
};

export function parseScreensRpy(content: string): ScreenConfig {
  const config = { ...DEFAULT_CONFIG };
  
  // A helper to extract a numeric property from a specific style block.
  // Style block starts with "style <style_name>:" or "style <style_name> is <parent>:"
  const extractStyleProp = (styleName: string, propName: string): number | null => {
    // Regex explanation:
    // Match "style styleName" (optionally " is something"):
    // Then match everything up until the next unindented line or another style block
    // Inside that, match "    propName value"
    const blockRe = new RegExp(`^style\\s+${styleName}(?:\\s+is\\s+\\w+)?:[\\s\\S]*?(?=^\\S|\\Z)`, 'm');
    const blockMatch = content.match(blockRe);
    if (!blockMatch) return null;
    
    const propRe = new RegExp(`^\\s+${propName}\\s+([-\\d.]+)`, 'm');
    const propMatch = blockMatch[0].match(propRe);
    if (propMatch) {
      return parseFloat(propMatch[1]);
    }
    return null;
  };

  const frame_xsize = extractStyleProp('main_menu_frame', 'xsize');
  if (frame_xsize !== null) config.main_menu_frame_xsize = frame_xsize;

  const game_frame_xsize = extractStyleProp('game_menu_navigation_frame', 'xsize');
  if (game_frame_xsize !== null) config.game_menu_navigation_frame_xsize = game_frame_xsize;

  const vbox_xalign = extractStyleProp('main_menu_vbox', 'xalign');
  if (vbox_xalign !== null) config.main_menu_vbox_xalign = vbox_xalign;

  const vbox_yalign = extractStyleProp('main_menu_vbox', 'yalign');
  if (vbox_yalign !== null) config.main_menu_vbox_yalign = vbox_yalign;

  const vbox_xoffset = extractStyleProp('main_menu_vbox', 'xoffset');
  if (vbox_xoffset !== null) config.main_menu_vbox_xoffset = vbox_xoffset;

  const vbox_yoffset = extractStyleProp('main_menu_vbox', 'yoffset');
  if (vbox_yoffset !== null) config.main_menu_vbox_yoffset = vbox_yoffset;

  const vbox_xsize = extractStyleProp('main_menu_vbox', 'xsize');
  if (vbox_xsize !== null) config.main_menu_vbox_xsize = vbox_xsize;

  const help_label_xsize = extractStyleProp('help_label', 'xsize');
  if (help_label_xsize !== null) config.help_label_xsize = help_label_xsize;

  return config;
}

export function patchScreensRpy(content: string, patches: Partial<ScreenConfig>): string {
  let newContent = content;

  // A helper to patch or insert a numeric property inside a style block.
  const applyPatch = (styleName: string, propName: string, value: number) => {
    const blockRe = new RegExp(`(^style\\s+${styleName}(?:\\s+is\\s+\\w+)?:(?:\\r?\\n)(?:\\s+.*\\r?\\n)*)`, 'm');
    const blockMatch = newContent.match(blockRe);
    
    if (blockMatch) {
      const block = blockMatch[1];
      const propRe = new RegExp(`(^\\s+)${propName}\\s+[-\\d.]+`, 'm');
      
      if (propRe.test(block)) {
        // Replace existing property
        const newBlock = block.replace(propRe, `$1${propName} ${value}`);
        newContent = newContent.replace(block, newBlock);
      } else {
        // Insert property at the end of the block
        // Find the standard indentation
        const indentMatch = block.match(/^(\s+)/m);
        const indent = indentMatch ? indentMatch[1] : '    ';
        const newBlock = block.replace(/(?:\r?\n)$/, `\n${indent}${propName} ${value}\n`);
        newContent = newContent.replace(block, newBlock);
      }
    }
  };

  if (patches.main_menu_frame_xsize !== undefined) applyPatch('main_menu_frame', 'xsize', patches.main_menu_frame_xsize);
  if (patches.game_menu_navigation_frame_xsize !== undefined) applyPatch('game_menu_navigation_frame', 'xsize', patches.game_menu_navigation_frame_xsize);
  if (patches.main_menu_vbox_xalign !== undefined) applyPatch('main_menu_vbox', 'xalign', patches.main_menu_vbox_xalign);
  if (patches.main_menu_vbox_yalign !== undefined) applyPatch('main_menu_vbox', 'yalign', patches.main_menu_vbox_yalign);
  if (patches.main_menu_vbox_xoffset !== undefined) applyPatch('main_menu_vbox', 'xoffset', patches.main_menu_vbox_xoffset);
  if (patches.main_menu_vbox_yoffset !== undefined) applyPatch('main_menu_vbox', 'yoffset', patches.main_menu_vbox_yoffset);
  if (patches.main_menu_vbox_xsize !== undefined) applyPatch('main_menu_vbox', 'xsize', patches.main_menu_vbox_xsize);
  if (patches.help_label_xsize !== undefined) applyPatch('help_label', 'xsize', patches.help_label_xsize);

  return newContent;
}
