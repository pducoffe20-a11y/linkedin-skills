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

### Non-interactive (agents / CI)

```bash
# Inspect the environment first (machine-readable)
npx @linkedapi/skills detect --json

# Install specific skills into specific agents
npx @linkedapi/skills add linkedin network-growth \
  --agent claude-code --agent codex --scope project --yes --json
```

Other commands: `list`, `update`, `remove`, `doctor` (all support `--json`). See
`npx @linkedapi/skills --help`.

## Available skills

| Skill | Description |
|-------|-------------|
| [linkedin](linkedin/) | General-purpose LinkedIn automation – fetch profiles, search people and companies, send messages, manage connections, create posts, and more |
| [network-growth](network-growth/) | Two-phase lead pipeline – import + qualify leads against your ICP, then send connection invites on a schedule across one or more accounts |

## Prerequisites

The installer checks these for you and offers to set them up:

- **Node.js ≥ 20**
- **`@linkedapi/linkedin-cli`** (`npm install -g @linkedapi/linkedin-cli`)
- **Linked API tokens** — get them at [app.linkedapi.io](https://app.linkedapi.io), then
  `linkedin setup` (the installer can run this for you).

## Manual install (fallback)

Copy the skill folder into your agent's skills directory, e.g. `.claude/skills/<skill>/`
(project) or `~/.claude/skills/<skill>/` (global). For `network-growth`, also run
`npm install --omit=dev` and `node scripts/doctor.mjs` inside the copied folder.

## License

This project is licensed under the MIT – see the [LICENSE](https://github.com/Linked-API/linkedin-skills/blob/main/LICENSE) file for details.
