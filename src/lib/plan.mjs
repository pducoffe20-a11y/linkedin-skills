// Shared planning helpers used by BOTH frontends (headless cli.mjs and interactive wizard.mjs):
// environment snapshot, target resolution, and lookups. Pure data — no prompting, no ANSI.
import {
  AGENTS,
  commandsDir,
  detectAgent,
  displayPath,
  getAgent,
  skillDir,
  skillsRoot,
} from './agents.mjs';
import { detectGit, detectOs, homeDir, nodeInfo } from './environment.mjs';
import { readManifest } from './manifest.mjs';
import { detectLinkedinCli, detectTokens } from './prereqs.mjs';
import { getSkill, listSkills } from './registry.mjs';

const SCOPES = ['project', 'global'];

export async function buildContext() {
  const home = homeDir();
  const git = await detectGit();
  const projectRoot = git.inRepo && git.root ? git.root : process.cwd();
  return { home, git, projectRoot };
}

export async function gatherSnapshot(ctx) {
  const os = detectOs();
  const node = nodeInfo();

  const agents = [];
  for (const agent of AGENTS) {
    agents.push({
      id: agent.id,
      label: agent.label,
      nativeSkills: agent.nativeSkills,
      detected: await detectAgent(agent, ctx.home),
      projectDir: displayPath(skillsRoot(agent, 'project', ctx), ctx.home),
      globalDir: displayPath(skillsRoot(agent, 'global', ctx), ctx.home),
    });
  }

  return {
    os: os.platform,
    arch: os.arch,
    wsl: os.wsl,
    node: node.version,
    nodeOk: node.ok,
    git: { inRepo: ctx.git.inRepo, root: ctx.git.root },
    agents,
    linkedinCli: await detectLinkedinCli(),
    tokens: detectTokens(),
    skills: listSkills().map((s) => ({ name: s.name, label: s.label, description: s.description })),
    installed: gatherInstalled(ctx),
  };
}

export function gatherInstalled(ctx) {
  const found = [];
  for (const agent of AGENTS) {
    for (const scope of SCOPES) {
      const manifest = readManifest(skillsRoot(agent, scope, ctx));
      for (const [name, entry] of Object.entries(manifest.skills)) {
        found.push({
          skill: name,
          agent: agent.id,
          scope,
          dir: skillDir(agent, scope, ctx, name),
          ...entry,
        });
      }
    }
  }
  return found;
}

export function resolveSkills(names) {
  const skills = [];
  const unknown = [];
  for (const name of names) {
    const skill = getSkill(name);
    if (skill) skills.push(skill);
    else unknown.push(name);
  }
  return { skills, unknown };
}

export function resolveAgentIds(ids) {
  const valid = [];
  const unknown = [];
  for (const id of ids) {
    if (getAgent(id)) valid.push(id);
    else unknown.push(id);
  }
  return { valid, unknown };
}

export function buildTargets(skill, agentIds, scope, ctx) {
  return agentIds.map((id) => {
    const agent = getAgent(id);
    return {
      agentId: agent.id,
      agentLabel: agent.label,
      nativeSkills: agent.nativeSkills,
      scope,
      skillsRoot: skillsRoot(agent, scope, ctx),
      skillDir: skillDir(agent, scope, ctx, skill.name),
      commandsDir: commandsDir(agent, scope, ctx),
    };
  });
}
