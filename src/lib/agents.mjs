import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { commandExists } from './exec.mjs';

// Registry of supported AI agents. `nativeSkills:false` means the agent reads SKILL.md only as
// imported rules (weaker than Claude Code / Codex) — surfaced to the user as a hint.
// Skill directory layouts confirmed against the `npx skills` (vercel-labs) agent table.
export const AGENTS = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    nativeSkills: true,
    bins: ['claude'],
    homeMarkers: ['.claude'],
    skillsSubdir: ['.claude', 'skills'],
    commandsSubdir: ['.claude', 'commands'],
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    nativeSkills: true,
    bins: ['codex'],
    homeMarkers: ['.codex'],
    skillsSubdir: ['.agents', 'skills'],
    commandsSubdir: null,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    nativeSkills: false,
    bins: ['cursor'],
    homeMarkers: ['.cursor'],
    skillsSubdir: ['.cursor', 'skills'],
    commandsSubdir: null,
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    nativeSkills: false,
    bins: ['windsurf'],
    homeMarkers: ['.codeium', '.windsurf'],
    skillsSubdir: ['.windsurf', 'skills'],
    commandsSubdir: null,
  },
];

export function getAgent(id) {
  return AGENTS.find((agent) => agent.id === id);
}

export async function detectAgent(agent, home) {
  for (const marker of agent.homeMarkers) {
    if (existsSync(join(home, marker))) return true;
  }
  for (const bin of agent.bins) {
    if (await commandExists(bin)) return true;
  }
  return false;
}

function scopeBase(scope, { projectRoot, home }) {
  return scope === 'global' ? home : projectRoot;
}

export function skillsRoot(agent, scope, context) {
  return join(scopeBase(scope, context), ...agent.skillsSubdir);
}

export function skillDir(agent, scope, context, skillName) {
  return join(skillsRoot(agent, scope, context), skillName);
}

export function commandsDir(agent, scope, context) {
  if (!agent.commandsSubdir) return null;
  return join(scopeBase(scope, context), ...agent.commandsSubdir);
}

export function displayPath(absolutePath, home) {
  if (absolutePath && absolutePath.startsWith(home)) {
    return `~${absolutePath.slice(home.length)}`;
  }
  return absolutePath;
}
