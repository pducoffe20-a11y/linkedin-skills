import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { basename, join } from 'node:path';

import { runCommand } from './exec.mjs';
import { recordSkill, removeSkillRecord } from './manifest.mjs';
import { skillSourceDir } from './registry.mjs';

const STEP_TIMEOUT_MS = 600000;

export function canonicalDir(home, skillName) {
  return join(home, '.linkedapi', 'skills', skillName);
}

// Places a skill into every target directory and runs its post-install steps. In `link` mode a
// single canonical copy is symlinked into each agent dir (copy fallback when symlinks are
// unavailable, e.g. Windows). Returns a structured, JSON-serializable result.
export async function installSkill(skill, targets, options) {
  const { mode = 'copy', dryRun = false, enableOptional = false, home, version } = options;
  const source = skillSourceDir(skill);
  const canonical = canonicalDir(home, skill.name);
  const result = {
    skill: skill.name,
    source,
    mode,
    targets: targets.map((t) => ({ agent: t.agentId, scope: t.scope, dir: t.skillDir })),
    postInstall: [],
    optional: [],
    slashCommands: null,
    ok: true,
  };

  if (dryRun) {
    result.postInstall = (skill.postInstall ?? []).map((s) => ({ step: stepLabel(s), planned: true }));
    if (enableOptional) {
      result.optional = (skill.optional ?? []).map((s) => ({ step: stepLabel(s), planned: true }));
    }
    if (skill.slashCommands) {
      result.slashCommands = targets.filter((t) => t.commandsDir).map((t) => t.commandsDir);
    }
    return result;
  }

  // 1. Place files; collect the distinct physical directories that need post-install.
  const physicalDirs = new Set();
  if (mode === 'link') {
    placeCopy(source, canonical);
    physicalDirs.add(canonical);
    for (const target of targets) {
      if (placeSymlink(canonical, target.skillDir) === 'copy') physicalDirs.add(target.skillDir);
    }
  } else {
    for (const target of targets) {
      placeCopy(source, target.skillDir);
      physicalDirs.add(target.skillDir);
    }
  }

  // 2. Post-install (and optional) steps, once per physical directory.
  for (const dir of physicalDirs) {
    for (const step of skill.postInstall ?? []) {
      const stepResult = await runStep(step, dir);
      result.postInstall.push({ dir, ...stepResult });
      if (!stepResult.ok) result.ok = false;
    }
    if (enableOptional) {
      for (const step of skill.optional ?? []) {
        result.optional.push({ dir, ...(await runStep(step, dir)) });
      }
    }
  }

  // 3. Slash commands (Claude Code only).
  if (skill.slashCommands) {
    result.slashCommands = copySlashCommands(skill, source, targets);
  }

  // 4. Record manifests.
  const installedAt = new Date().toISOString();
  for (const target of targets) {
    recordSkill(target.skillsRoot, skill.name, {
      version,
      scope: target.scope,
      agent: target.agentId,
      mode,
      installedAt,
    });
  }

  return result;
}

export function removeSkill(skill, targets) {
  const removed = [];
  const source = skillSourceDir(skill);
  for (const target of targets) {
    if (existsSync(target.skillDir)) {
      rmSync(target.skillDir, { recursive: true, force: true });
      removed.push(target.skillDir);
    }
    removeSkillRecord(target.skillsRoot, skill.name);
    if (target.commandsDir && skill.slashCommands) {
      const cmdSource = join(source, skill.slashCommands);
      if (existsSync(cmdSource)) {
        for (const file of readdirSync(cmdSource)) {
          const dest = join(target.commandsDir, file);
          if (file.endsWith('.md') && existsSync(dest)) rmSync(dest, { force: true });
        }
      }
    }
  }
  return { skill: skill.name, removed };
}

function copySlashCommands(skill, source, targets) {
  const copied = [];
  const cmdSource = join(source, skill.slashCommands);
  if (!existsSync(cmdSource)) return copied;
  for (const target of targets) {
    if (!target.commandsDir) continue;
    mkdirSync(target.commandsDir, { recursive: true });
    for (const file of readdirSync(cmdSource)) {
      if (!file.endsWith('.md')) continue;
      const dest = join(target.commandsDir, file);
      cpSync(join(cmdSource, file), dest, { force: true });
      copied.push(dest);
    }
  }
  return copied;
}

async function runStep(step, dir) {
  const args = step.run.map((token) => (token === '<skillDir>' ? dir : token));
  const cwd = step.cwd === '<skillDir>' ? dir : (step.cwd ?? dir);
  const [command, ...rest] = args;
  const res = await runCommand(command, rest, { cwd, timeoutMs: STEP_TIMEOUT_MS });
  let ok = res.ok;
  if (step.expect === 'ok') {
    const parsed = tryParseJson(res.stdout);
    ok = res.exitCode === 0 && parsed?.data?.ok === true;
  }
  return { step: stepLabel(step), ok, exitCode: res.exitCode, stderr: trimTail(res.stderr) };
}

function copyDir(src, dest) {
  cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: (from) => {
      const base = basename(from);
      return base !== 'node_modules' && base !== '.git';
    },
  });
}

function placeCopy(src, dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, '..'), { recursive: true });
  copyDir(src, dest);
}

function placeSymlink(canonical, dest) {
  mkdirSync(join(dest, '..'), { recursive: true });
  rmSync(dest, { recursive: true, force: true });
  try {
    symlinkSync(canonical, dest, 'dir');
    return 'link';
  } catch {
    copyDir(canonical, dest);
    return 'copy';
  }
}

function stepLabel(step) {
  return step.label ?? step.run.join(' ');
}

function tryParseJson(value) {
  try {
    return JSON.parse(String(value).trim());
  } catch {
    return undefined;
  }
}

function trimTail(value) {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  return text.length > 500 ? text.slice(-500) : text;
}
