import { run } from '../exec';
import { ConnectionTestResult } from '../../shared/types';

const SUCCESS_PATTERNS = [
  /successfully authenticated/i, // GitHub
  /welcome to gitlab/i,
  /logged in as/i, // Bitbucket
  /authenticated via ssh key/i,
];

// Git hosts close the connection after the banner (exit code 1), so success
// is judged by the banner text, not the exit code.
export async function testConnection(alias: string, user: string | null): Promise<ConnectionTestResult> {
  const target = user ? `${user}@${alias}` : alias;
  const res = await run(
    'ssh',
    ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=accept-new', target],
    20000
  );
  const output = [res.stdout, res.stderr].filter(Boolean).join('\n').trim();
  const bannerOk = SUCCESS_PATTERNS.some((re) => re.test(output));
  const ok = bannerOk || res.code === 0;

  let summary: string;
  if (bannerOk) {
    summary = 'Authenticated successfully';
  } else if (res.code === 0) {
    summary = 'Connection succeeded';
  } else if (/permission denied/i.test(output)) {
    summary = 'Permission denied — the key is not authorized on this host';
  } else if (/could not resolve hostname/i.test(output)) {
    summary = 'Host not found — check the HostName for this profile';
  } else if (/timed out|timeout/i.test(output) || res.code === null) {
    summary = 'Connection timed out';
  } else {
    summary = 'Connection failed';
  }
  return { ok, exitCode: res.code, output: output || '(no output)', summary };
}
