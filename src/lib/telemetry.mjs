import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const DEFAULT_BASE_URL = 'https://api.linkedapi.io';
const REQUEST_TIMEOUT_MS = 3000;

export async function recordSkillTelemetry({ event, skill, targets, version, mode, home } = {}) {
  try {
    if (!event || !skill?.name || !Array.isArray(targets) || targets.length === 0) {
      return;
    }

    const telemetryHome = home ?? homedir();
    const state = readTelemetryState(telemetryHome);
    const newEvents = buildTelemetryEvents({
      event,
      installId: state.installId,
      skillName: skill.name,
      version,
      mode,
      targets,
    });
    const token = readLinkedApiToken();

    if (!token || typeof fetch !== 'function') {
      state.pendingTelemetry.push(...newEvents);
      writeTelemetryState(telemetryHome, state);
      return;
    }

    const events = [...state.pendingTelemetry, ...newEvents];
    const sent = await postTelemetryEvents(token, events);
    state.pendingTelemetry = sent ? [] : events;
    writeTelemetryState(telemetryHome, state);
  } catch {
    // Telemetry is best-effort and must never affect install/update/remove.
  }
}

function buildTelemetryEvents({ event, installId, skillName, version, mode, targets }) {
  const occurredAt = new Date().toISOString();

  return targets.map((target) => ({
    event,
    installId,
    skill: skillName,
    version,
    agent: target.agentId ?? target.agent ?? null,
    scope: target.scope ?? null,
    mode: target.mode ?? mode ?? null,
    occurredAt,
  }));
}

function telemetryStatePath(home) {
  return join(home, '.linkedapi', 'skills', 'telemetry.json');
}

function readTelemetryState(home) {
  const path = telemetryStatePath(home);

  if (!existsSync(path)) {
    return {
      installId: randomUUID(),
      pendingTelemetry: [],
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const installId =
      typeof parsed.installId === 'string' && parsed.installId.length > 0
        ? parsed.installId
        : randomUUID();
    const pendingTelemetry = Array.isArray(parsed.pendingTelemetry)
      ? parsed.pendingTelemetry.filter(isTelemetryEvent)
      : [];

    return { installId, pendingTelemetry };
  } catch {
    return {
      installId: randomUUID(),
      pendingTelemetry: [],
    };
  }
}

function writeTelemetryState(home, state) {
  const path = telemetryStatePath(home);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function isTelemetryEvent(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.event === 'string' &&
    typeof value.installId === 'string' &&
    typeof value.skill === 'string' &&
    typeof value.occurredAt === 'string'
  );
}

function linkedinConfigPath() {
  const base = process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, 'linkedin-cli')
    : join(homedir(), '.config', 'linkedin-cli');

  return join(base, 'config.json');
}

function readLinkedApiToken() {
  try {
    const parsed = JSON.parse(readFileSync(linkedinConfigPath(), 'utf8'));

    if (typeof parsed.linkedApiToken === 'string' && !Array.isArray(parsed.accounts)) {
      return parsed.linkedApiToken;
    }

    const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
    const current = accounts.find(
      (account) => account.identificationToken === parsed.currentAccount,
    );
    const account = current ?? accounts[0];

    return typeof account?.linkedApiToken === 'string' && account.linkedApiToken.length > 0
      ? account.linkedApiToken
      : undefined;
  } catch {
    return undefined;
  }
}

async function postTelemetryEvents(token, events) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(telemetryEndpoint(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'linked-api-token': token,
      },
      body: JSON.stringify(events),
      signal: controller.signal,
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function telemetryEndpoint() {
  const baseUrl = process.env.LINKED_API_BASE_URL?.trim() || DEFAULT_BASE_URL;

  return `${baseUrl.replace(/\/+$/, '')}/telemetry/skill-events`;
}
