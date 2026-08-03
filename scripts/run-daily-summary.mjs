#!/usr/bin/env node
/**
 * Prefer HTTP POST if core is running; else run in-process via tsx.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = path.join(root, 'apps/core');

async function viaHttp() {
  try {
    const res = await fetch('http://127.0.0.1:8787/summary/daily', {
      method: 'POST',
    });
    if (!res.ok) throw new Error(String(res.status));
    console.log('[daily-summary]', await res.json());
    return true;
  } catch {
    return false;
  }
}

if (await viaHttp()) process.exit(0);

const tsx = path.join(core, 'node_modules/.bin/tsx');
const script = path.join(core, 'scripts/daily-summary-once.ts');
const child = spawn(tsx, [script], {
  cwd: core,
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 1));
