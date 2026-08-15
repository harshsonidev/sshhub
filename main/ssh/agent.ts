import { run } from '../exec';
import { AgentKey } from '../../shared/types';

// `ssh-add -l` output: "<bits> SHA256:<hash> <comment> (<ALGO>)"
export async function listAgentKeys(): Promise<AgentKey[]> {
  const res = await run('ssh-add', ['-l']);
  // Exit 1 = "The agent has no identities", exit 2 = agent not running.
  if (res.code !== 0) return [];
  const keys: AgentKey[] = [];
  for (const line of res.stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+(.*)\s+\((\w+(?:-\w+)*)\)$/);
    if (m) {
      keys.push({ bits: parseInt(m[1], 10), fingerprint: m[2], comment: m[3].trim(), algorithm: m[4] });
    }
  }
  return keys;
}

export async function addKeyToAgent(privateKeyPath: string): Promise<string> {
  // --apple-use-keychain lets macOS pull the passphrase from Keychain; harmless flag
  // is rejected on other platforms, so fall back to a plain add.
  const mac = process.platform === 'darwin';
  let res = mac
    ? await run('ssh-add', ['--apple-use-keychain', privateKeyPath])
    : await run('ssh-add', [privateKeyPath]);
  if (mac && res.code !== 0) {
    res = await run('ssh-add', [privateKeyPath]);
  }
  if (res.code !== 0) {
    throw new Error(
      (res.stderr || res.stdout || 'ssh-add failed').trim() +
        (res.stderr.includes('passphrase') ? '' : ' (passphrase-protected keys must be added from a terminal once, or stored in the OS keychain)')
    );
  }
  return (res.stderr || res.stdout).trim();
}

export async function removeKeyFromAgent(privateKeyPath: string): Promise<string> {
  const res = await run('ssh-add', ['-d', privateKeyPath]);
  if (res.code !== 0) throw new Error((res.stderr || res.stdout || 'ssh-add -d failed').trim());
  return (res.stderr || res.stdout).trim();
}
