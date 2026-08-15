import { execFile } from 'child_process';

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

// Run a binary without a shell (no injection surface from user-provided
// aliases/paths) and never reject: callers inspect the exit code.
export function run(cmd: string, args: string[], timeoutMs = 15000): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, encoding: 'utf8' }, (err, stdout, stderr) => {
      const anyErr = err as (Error & { code?: number | string }) | null;
      let code: number | null = 0;
      if (anyErr) {
        code = typeof anyErr.code === 'number' ? anyErr.code : null;
      }
      resolve({ code, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}
