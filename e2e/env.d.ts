// playwright.config.ts reads process.env. Declared here rather than installing
// @types/node, whose globals would leak into the app's own type-check.
declare const process: { env: Record<string, string | undefined> };
