import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// src/lib/registry.mjs → package root is two directories up. Bundled skill content
// (linkedin/, linkedin-growth/) and registry.json live at the package root.
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let cached;

export function loadRegistry() {
  if (!cached) {
    const parsed = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'registry.json'), 'utf8'));
    if (!parsed || typeof parsed.skills !== 'object') {
      throw new Error('registry.json is malformed: missing "skills"');
    }
    cached = parsed;
  }
  return cached;
}

export function listSkills() {
  const { skills } = loadRegistry();
  return Object.entries(skills).map(([name, spec]) => ({ name, ...spec }));
}

export function getSkill(name) {
  const spec = loadRegistry().skills[name];
  return spec ? { name, ...spec } : undefined;
}

export function skillSourceDir(skill) {
  return join(PACKAGE_ROOT, skill.source);
}

export function packageVersion() {
  return JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;
}
