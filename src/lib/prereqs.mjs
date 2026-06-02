import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { runCommand, runForeground } from './exec.mjs';

const CLI_PACKAGE = '@linkedapi/linkedin-cli';

// Mirrors linkedin-cli's config-store resolution: $XDG_CONFIG_HOME/linkedin-cli/config.json,
// else ~/.config/linkedin-cli/config.json.
function configPath() {
  const base = process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, 'linkedin-cli')
    : join(homedir(), '.config', 'linkedin-cli');
  return join(base, 'config.json');
}

export async function detectLinkedinCli() {
  const probe = await runCommand('linkedin', ['--version'], { timeoutMs: 15000 });
  if (!probe.ok) return { installed: false, version: null };
  const match = probe.stdout.match(/(\d+\.\d+\.\d+)/);
  return { installed: true, version: match ? match[1] : null };
}

export function detectTokens() {
  try {
    const parsed = JSON.parse(readFileSync(configPath(), 'utf8'));
    const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
    return { configured: accounts.length > 0, accountCount: accounts.length };
  } catch {
    return { configured: false, accountCount: 0 };
  }
}

export function installCli({ foreground = false } = {}) {
  const args = ['install', '-g', CLI_PACKAGE];
  return foreground ? runForeground('npm', args) : runCommand('npm', args, { timeoutMs: 300000 });
}

// With both tokens → non-interactive. Without tokens + foreground → interactive masked prompts
// (TTY only). Never call without tokens in headless mode (the CLI would exit with an error).
export function runSetup({ linkedApiToken, identificationToken, foreground = false } = {}) {
  const args = ['setup'];
  if (linkedApiToken) args.push(`--linked-api-token=${linkedApiToken}`);
  if (identificationToken) args.push(`--identification-token=${identificationToken}`);
  return foreground ? runForeground('linkedin', args) : runCommand('linkedin', args, { timeoutMs: 120000 });
}
