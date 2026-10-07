#!/usr/bin/env node
// Launcher. Uses the built JavaScript when present (always the case for npm
// installs), otherwise runs the TypeScript source directly (Node 22.18+).
import { existsSync } from 'node:fs';

const dist = new URL('../dist/cli.js', import.meta.url);
const { runCli } = await import(existsSync(dist) ? dist.href : new URL('../src/cli.ts', import.meta.url).href);
await runCli();
