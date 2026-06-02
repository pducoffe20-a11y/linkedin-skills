import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// One manifest per skills-root directory (e.g. ~/.claude/skills/.linkedapi-skills.json) tracks
// every skill this installer placed there — enabling idempotent re-runs, `list`, and `remove`.
const MANIFEST_FILE = '.linkedapi-skills.json';

export function manifestPath(skillsRootDir) {
  return join(skillsRootDir, MANIFEST_FILE);
}

export function readManifest(skillsRootDir) {
  const path = manifestPath(skillsRootDir);
  if (!existsSync(path)) return { skills: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed.skills === 'object' ? parsed : { skills: {} };
  } catch {
    return { skills: {} };
  }
}

export function recordSkill(skillsRootDir, name, entry) {
  const manifest = readManifest(skillsRootDir);
  manifest.skills[name] = entry;
  writeManifest(skillsRootDir, manifest);
}

export function removeSkillRecord(skillsRootDir, name) {
  const manifest = readManifest(skillsRootDir);
  delete manifest.skills[name];
  writeManifest(skillsRootDir, manifest);
}

function writeManifest(skillsRootDir, manifest) {
  mkdirSync(skillsRootDir, { recursive: true });
  writeFileSync(manifestPath(skillsRootDir), `${JSON.stringify(manifest, null, 2)}\n`);
}
