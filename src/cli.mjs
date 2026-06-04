#!/usr/bin/env node
import { AGENTS, commandsDir, getAgent, skillsRoot } from './lib/agents.mjs';
import { boolFlag, listFlag, parseArgs, strFlag } from './lib/args.mjs';
import { installSkill, removeSkill } from './lib/install.mjs';
import { failure, isJsonMode, success, writeResult } from './lib/output.mjs';
import {
  buildContext,
  buildTargets,
  gatherInstalled,
  gatherSnapshot,
  resolveAgentIds,
  resolveSkills,
} from './lib/plan.mjs';
import { detectLinkedinCli, detectTokens, runSetup } from './lib/prereqs.mjs';
import { getSkill, packageVersion } from './lib/registry.mjs';

const COMMANDS = ['detect', 'add', 'list', 'update', 'remove', 'doctor'];

async function main() {
  const raw = process.argv.slice(2);
  const { positional, flags } = parseArgs(raw);
  const sub = positional[0];
  const rest = positional.slice(1);

  if (sub === 'help' || raw.includes('-h') || raw.includes('--help')) return printHelp();
  if (raw.includes('-v') || raw.includes('--version')) {
    process.stdout.write(`${packageVersion()}\n`);
    return;
  }

  const ctx = await buildContext();

  switch (sub) {
    case undefined:
      if (process.stdout.isTTY && !isJsonMode() && !boolFlag(flags, 'yes')) {
        const { runInteractive } = await import('./lib/wizard.mjs');
        return runInteractive(ctx);
      }
      return fail(
        2,
        'No command. Run in a terminal for the interactive installer, or use a headless command. See --help.',
      );
    case 'detect':
      return commandDetect(ctx);
    case 'add':
      return commandAdd(rest, flags, ctx);
    case 'list':
      return commandList(ctx);
    case 'update':
      return commandUpdate(rest, ctx);
    case 'remove':
      return commandRemove(rest, ctx);
    case 'doctor':
      return commandDoctor(ctx);
    default:
      return fail(2, `Unknown command "${sub}". Commands: ${COMMANDS.join(', ')}.`);
  }
}

async function commandDetect(ctx) {
  writeResult(success(await gatherSnapshot(ctx)));
}

async function commandAdd(skillNames, flags, ctx) {
  const dryRun = boolFlag(flags, 'dry-run');
  const yes = boolFlag(flags, 'yes');
  const mode = boolFlag(flags, 'link') ? 'link' : 'copy';
  const enableScheduler = boolFlag(flags, 'enable-scheduler');

  if (skillNames.length === 0) {
    return fail(2, 'No skills specified. Usage: add <skill...> --agent <id> --scope <project|global>');
  }
  const { skills, unknown: unknownSkills } = resolveSkills(skillNames);
  if (unknownSkills.length) return fail(2, `Unknown skill(s): ${unknownSkills.join(', ')}`);

  let agentIds = listFlag(flags, 'agent');
  if (agentIds.length === 0) {
    if (!yes) {
      return fail(2, 'No --agent given. Pass --agent <id> (repeatable) or --yes to use detected agents.');
    }
    const snapshot = await gatherSnapshot(ctx);
    agentIds = snapshot.agents.filter((a) => a.detected).map((a) => a.id);
    if (agentIds.length === 0) return fail(2, 'No agents detected; pass --agent <id> explicitly.');
  }
  const { valid: agents, unknown: unknownAgents } = resolveAgentIds(agentIds);
  if (unknownAgents.length) {
    return fail(2, `Unknown agent(s): ${unknownAgents.join(', ')}. Valid: ${AGENTS.map((a) => a.id).join(', ')}`);
  }

  let scope = strFlag(flags, 'scope');
  if (!scope) {
    if (!yes) return fail(2, 'No --scope given. Pass --scope project|global or --yes.');
    scope = ctx.git.inRepo ? 'project' : 'global';
  }
  if (scope !== 'project' && scope !== 'global') {
    return fail(2, `Invalid --scope "${scope}" (use project or global).`);
  }

  const prereqs = await ensurePrereqsHeadless(flags, dryRun);

  const version = packageVersion();
  const installed = [];
  for (const skill of skills) {
    const targets = buildTargets(skill, agents, scope, ctx);
    installed.push(
      await installSkill(skill, targets, {
        mode,
        dryRun,
        enableOptional: enableScheduler,
        home: ctx.home,
        version,
      }),
    );
  }

  // Exit code reflects whether the INSTALL succeeded (files + required steps) — NOT whether
  // every skill is fully configured. A skill can install fine yet still need setup (e.g.
  // LinkedIn tokens); that shows up as `ready: false` + `pending`, not a non-zero exit, so a
  // JSON-parsing agent isn't tricked into treating "needs setup" as "install failed".
  const ok = installed.every((r) => r.ok);
  const ready = installed.every((r) => r.ready !== false);
  const pending = installed
    .filter((r) => r.ready === false)
    .map((r) => ({ skill: r.skill, pending: r.pending ?? [] }));
  writeResult(success({ dryRun, scope, mode, agents, prereqs, installed, ready, pending }));
  process.exit(ok ? 0 : 1);
}

async function commandList(ctx) {
  writeResult(success({ installed: gatherInstalled(ctx) }));
}

async function commandUpdate(skillNames, ctx) {
  const installed = gatherInstalled(ctx);
  const names = skillNames.length ? skillNames : [...new Set(installed.map((i) => i.skill))];
  const { skills, unknown } = resolveSkills(names);
  if (unknown.length) return fail(2, `Unknown skill(s): ${unknown.join(', ')}`);

  const version = packageVersion();
  const updated = [];
  for (const skill of skills) {
    const locations = installed.filter((i) => i.skill === skill.name);
    const byMode = groupByMode(locations, ctx);
    for (const [mode, targets] of byMode) {
      updated.push(
        await installSkill(skill, targets, {
          mode,
          dryRun: false,
          enableOptional: false,
          home: ctx.home,
          version,
        }),
      );
    }
  }
  const ok = updated.every((r) => r.ok);
  writeResult(success({ updated }));
  process.exit(ok ? 0 : 1);
}

async function commandRemove(skillNames, ctx) {
  if (skillNames.length === 0) return fail(2, 'No skills specified. Usage: remove <skill...>');
  const { skills, unknown } = resolveSkills(skillNames);
  if (unknown.length) return fail(2, `Unknown skill(s): ${unknown.join(', ')}`);

  const installed = gatherInstalled(ctx);
  const removed = [];
  for (const skill of skills) {
    const targets = installed
      .filter((i) => i.skill === skill.name)
      .map((loc) => {
        const agent = getAgent(loc.agent);
        return {
          agentId: loc.agent,
          scope: loc.scope,
          skillsRoot: skillsRoot(agent, loc.scope, ctx),
          skillDir: loc.dir,
          commandsDir: commandsDir(agent, loc.scope, ctx),
        };
      });
    removed.push(removeSkill(skill, targets));
  }
  writeResult(success({ removed }));
}

async function commandDoctor(ctx) {
  const snapshot = await gatherSnapshot(ctx);
  const health = {
    nodeOk: snapshot.nodeOk,
    linkedinCliInstalled: snapshot.linkedinCli.installed,
    tokensConfigured: snapshot.tokens.configured,
    agentsDetected: snapshot.agents.filter((a) => a.detected).map((a) => a.id),
  };
  const ok = snapshot.nodeOk;
  writeResult(success({ ok, health, snapshot }));
  process.exit(ok ? 0 : 1);
}

async function ensurePrereqsHeadless(flags, dryRun) {
  const linkedinCli = await detectLinkedinCli();
  let tokens = detectTokens();
  let setup = null;
  const linkedApiToken = strFlag(flags, 'linked-api-token');
  const identificationToken = strFlag(flags, 'identification-token');
  if (!dryRun && linkedApiToken && identificationToken) {
    const res = await runSetup({ linkedApiToken, identificationToken });
    setup = { attempted: true, ok: res.ok };
    tokens = detectTokens();
  }
  return { linkedinCli, tokens, setup };
}

function groupByMode(locations, ctx) {
  const byMode = new Map();
  for (const loc of locations) {
    const mode = loc.mode ?? 'copy';
    const agent = getAgent(loc.agent);
    const target = {
      agentId: loc.agent,
      scope: loc.scope,
      skillsRoot: skillsRoot(agent, loc.scope, ctx),
      skillDir: loc.dir,
      commandsDir: commandsDir(agent, loc.scope, ctx),
    };
    if (!byMode.has(mode)) byMode.set(mode, []);
    byMode.get(mode).push(target);
  }
  return byMode;
}

function fail(code, message, details) {
  writeResult(failure(code, message, details));
  process.exit(code === 2 ? 2 : 1);
}

function printHelp() {
  process.stdout.write(
    `Linked API skills installer

Usage:
  npx @linkedapi/skills                          Interactive installer (in a terminal)
  npx @linkedapi/skills detect [--json]          Environment snapshot for agents / CI
  npx @linkedapi/skills add <skill...> [opts]    Install skills
  npx @linkedapi/skills list [--json]            List installed skills
  npx @linkedapi/skills update [skill...]        Re-install (update) installed skills
  npx @linkedapi/skills remove <skill...>        Remove skills
  npx @linkedapi/skills doctor [--json]          Check environment & prerequisites

Skills:  linkedin, network-growth
Agents:  ${AGENTS.map((a) => a.id).join(', ')}

Options:
  --agent <id>          Target agent (repeatable). With --yes, defaults to detected agents.
  --scope <s>           project | global. With --yes, defaults to project in a git repo, else global.
  --link                Symlink one canonical copy into each agent (default: copy).
  --linked-api-token=…  Configure tokens non-interactively (with --identification-token=…).
  --enable-scheduler    Enable the network-growth background scheduler.
  --yes                 Non-interactive: take defaults/flags, never prompt.
  --json                Machine-readable {success,data} / {success,error} output.
  --dry-run             Print planned file operations; write nothing.
  -h, --help            Show this help.
  -v, --version         Print version.
`,
  );
}

main().catch((err) => {
  writeResult(failure(1, err?.message ?? String(err)));
  process.exit(1);
});
