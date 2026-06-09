// Output envelope shared by all headless commands, mirroring the {success,data} /
// {success,error} shape used by linkedin-growth/scripts/lib/output.mjs. In --json mode only the
// final JSON line is written to stdout (no ANSI / spinners); human-readable logs go to stderr.

export function isJsonMode(argv = process.argv) {
  return argv.includes('--json');
}

export function success(data) {
  return { success: true, data };
}

export function failure(code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return { success: false, error };
}

export function writeResult(payload, { json = isJsonMode() } = {}) {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  } else {
    process.stdout.write(`${formatHuman(payload)}\n`);
  }
}

// Diagnostic lines that must never pollute the JSON on stdout.
export function logInfo(message) {
  process.stderr.write(`${message}\n`);
}

function formatHuman(payload) {
  if (payload && typeof payload === 'object' && 'success' in payload) {
    if (!payload.success) {
      const error = payload.error ?? {};
      return `error: ${error.message ?? JSON.stringify(error)}`;
    }
    return formatValue(payload.data);
  }
  return formatValue(payload);
}

function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}
