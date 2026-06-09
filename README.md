# linkedin-skills

A collection of LinkedIn skills for AI agents (Claude Code, Codex, Cursor, Windsurf), powered by
[LinkedIn CLI](https://github.com/Linked-API/linkedin-cli) (`@linkedapi/linkedin-cli`) and
[Linked API](https://linkedapi.io).

## Install

One command — detects your installed agents, asks what to install and where, and sets up the
prerequisites for you:

```bash
npx @linkedapi/skills
```

Or just hand this to your AI agent:

```text
Read https://linkedapi.io/skills/install.md and follow it.
```

For a single skill, hand over its own runbook instead — e.g.
`https://linkedapi.io/skills/linkedin/install.md` or
`https://linkedapi.io/skills/linkedin-growth/install.md`.

### Non-interactive (agents / CI)

```bash
# Inspect the environment first (machine-readable)
npx @linkedapi/skills detect --json

# Install one skill in one command
npx @linkedapi/skills add linkedin --yes

# Install specific skills into specific agents
npx @linkedapi/skills add linkedin linkedin-growth \
  --agent claude-code --agent codex --scope project --yes --json
```

Other commands: `list`, `update`, `remove`, `doctor` (all support `--json`). See
`npx @linkedapi/skills --help`.

#### Exit codes & readiness

`add` separates two things so a caller never mistakes "needs setup" for "install failed"
(the agent-facing install runbook at `linkedapi.io/skills/install.md` spells this out for AI agents):

- **Exit code** reflects only whether the install itself succeeded (files placed +
  dependencies installed). `0` = installed. `1` = a real install failure. `2` = bad arguments.
- **Readiness** is reported in the JSON, not the exit code. Each skill carries `ok` (installed)
  and `ready` (fully configured and usable now). When a skill installed fine but still needs
  setup — e.g. LinkedIn tokens not connected yet — you get **exit 0** with `ready: false` and a
  `pending` list describing what's left. Always parse the JSON; do not treat a readiness gap as
  a failure.

```jsonc
{ "success": true,
  "data": {
    "ready": false,
    "pending": [{ "skill": "linkedin-growth", "pending": [{ "name": "db-accounts", "message": "0 accounts in DB — register each linkedin-cli account…" }] }],
    "installed": [{ "skill": "linkedin-growth", "ok": true, "ready": false }]
  } }
```

## Available skills

| Skill | Description |
|-------|-------------|
| [linkedin](linkedin/) | General-purpose LinkedIn automation – fetch profiles, search people and companies, send messages, manage connections, create posts, and more |
| [linkedin-growth](linkedin-growth/) | Two-phase lead pipeline – import + qualify leads against your ICP, then send connection invites on a schedule across one or more accounts |

## Prerequisites

The installer checks these for you and offers to set them up:

- **Node.js ≥ 20**
- **`@linkedapi/linkedin-cli`** (`npm install -g @linkedapi/linkedin-cli`)
- **Linked API tokens** — get them at [app.linkedapi.io](https://app.linkedapi.io), then
  `linkedin setup` (the installer can run this for you).

## Manual install (fallback)

Copy the skill folder into your agent's skills directory, e.g. `.claude/skills/<skill>/`
(project) or `~/.claude/skills/<skill>/` (global). For `linkedin-growth`, also run
`npm install --omit=dev` and `node scripts/doctor.mjs` inside the copied folder.

## License

This project is licensed under the MIT – see the [LICENSE](https://github.com/Linked-API/linkedin-skills/blob/main/LICENSE) file for details.
