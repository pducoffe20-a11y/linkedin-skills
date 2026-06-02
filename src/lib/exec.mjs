import { spawn } from 'node:child_process';

// Captured run: collects stdout/stderr, never inherits the terminal. Used for detection and for
// headless-mode actions. Resolves (never rejects) with a structured result.
export function runCommand(command, args = [], { input, cwd, env, timeoutMs = 600000 } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: env ?? process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({ ok: false, exitCode: -1, stdout: '', stderr: '', error: err.message });
      return;
    }

    let stdout = '';
    let stderr = '';
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (b) => (stdout += b.toString()));
    child.stderr.on('data', (b) => (stderr += b.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, exitCode: -1, stdout, stderr, error: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !killed, exitCode: code ?? -1, stdout, stderr, killed });
    });

    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}

// Foreground run: inherits the terminal so the user sees progress / interactive prompts
// (e.g. `npm install`, interactive `linkedin setup`). Only used by the interactive frontend.
export function runForeground(command, args = [], { cwd, env } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { cwd, env: env ?? process.env, stdio: 'inherit' });
    } catch (err) {
      resolve({ ok: false, exitCode: -1, error: err.message });
      return;
    }
    child.on('error', (err) => resolve({ ok: false, exitCode: -1, error: err.message }));
    child.on('close', (code) => resolve({ ok: code === 0, exitCode: code ?? -1 }));
  });
}

export async function commandExists(command) {
  const probe =
    process.platform === 'win32'
      ? await runCommand('where', [command], { timeoutMs: 10000 })
      : await runCommand('sh', ['-c', `command -v ${command}`], { timeoutMs: 10000 });
  return probe.ok && probe.stdout.trim().length > 0;
}
