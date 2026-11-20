// Public library API — everything the CLI and tests consume.
export { parseFile } from './adapters/index.ts';
export { parseCodex } from './adapters/codex.ts';
export { parseDsh } from './adapters/dsh.ts';
export { parseClaude } from './adapters/claude.ts';
export { analyze } from './analyze/index.ts';
export type { Report, Finding, RuleSurvival, ContextPoint } from './analyze/index.ts';
export * from './types.ts';
