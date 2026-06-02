import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';

import { runCommand } from './exec.mjs';

const MIN_NODE_MAJOR = 20;

export function detectOs() {
  return { platform: process.platform, arch: process.arch, wsl: isWsl() };
}

export function nodeInfo() {
  const version = process.versions.node;
  const major = Number(version.split('.')[0]);
  return { version, ok: Number.isFinite(major) && major >= MIN_NODE_MAJOR };
}

export async function detectGit(cwd = process.cwd()) {
  const inside = await runCommand('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd,
    timeoutMs: 10000,
  });
  if (!inside.ok || inside.stdout.trim() !== 'true') {
    return { inRepo: false, root: null };
  }
  const top = await runCommand('git', ['rev-parse', '--show-toplevel'], { cwd, timeoutMs: 10000 });
  return { inRepo: true, root: top.ok ? top.stdout.trim() : null };
}

export function homeDir() {
  return homedir();
}

function isWsl() {
  if (process.platform !== 'linux') return false;
  try {
    return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}
