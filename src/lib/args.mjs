// Minimal argv parser, mirroring linkedin-growth/scripts/lib/args.mjs but with support for
// repeated flags (e.g. `--agent claude-code --agent codex`) collapsed into arrays.

export function parseArgs(argv = process.argv.slice(2)) {
  const positional = [];
  const flags = {};

  function setFlag(key, value) {
    if (Object.prototype.hasOwnProperty.call(flags, key)) {
      const existing = flags[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        flags[key] = [existing, value];
      }
    } else {
      flags[key] = value;
    }
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        setFlag(arg.slice(2, eq), arg.slice(eq + 1));
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
          setFlag(key, true);
        } else {
          setFlag(key, next);
          i++;
        }
      }
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

export function boolFlag(flags, name, fallback = false) {
  const value = flags[name];
  if (value === undefined) return fallback;
  if (value === true) return true;
  const last = Array.isArray(value) ? value[value.length - 1] : value;
  const normalized = String(last).toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return Boolean(value);
}

// Returns a flattened list for a flag that may be repeated and/or comma-separated.
export function listFlag(flags, name) {
  const value = flags[name];
  if (value === undefined || value === true) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}

export function strFlag(flags, name, fallback = undefined) {
  const value = flags[name];
  if (value === undefined || value === true) return fallback;
  return String(Array.isArray(value) ? value[value.length - 1] : value);
}
