import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { run } from '../exec';
import { getProfiles } from '../store';
import { listAgentKeys } from './agent';
import {
  DuplicateGroup,
  GenerateKeyRequest,
  GenerateKeyResult,
  SshKeyInfo,
} from '../../shared/types';

export function sshDir(): string {
  return path.join(os.homedir(), '.ssh');
}

const NOT_KEYS = new Set(['config', 'known_hosts', 'known_hosts.old', 'authorized_keys', 'agent.env']);

function looksLikePrivateKey(filePath: string): boolean {
  try {
    const head = fs.readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).slice(0, 100);
    return head.includes('PRIVATE KEY');
  } catch {
    return false;
  }
}

interface FingerprintInfo {
  bits: number | null;
  fingerprint: string | null;
  comment: string | null;
  algorithm: string | null;
}

// `ssh-keygen -lf` output: "<bits> SHA256:<hash> <comment> (<ALGO>)"
async function fingerprintOf(pubPath: string): Promise<FingerprintInfo> {
  const res = await run('ssh-keygen', ['-lf', pubPath]);
  if (res.code !== 0) return { bits: null, fingerprint: null, comment: null, algorithm: null };
  const m = res.stdout.trim().match(/^(\d+)\s+(\S+)\s+(.*)\s+\((\w+)\)$/);
  if (!m) return { bits: null, fingerprint: null, comment: null, algorithm: null };
  return {
    bits: parseInt(m[1], 10),
    fingerprint: m[2],
    comment: m[3].trim() || null,
    algorithm: m[4],
  };
}

export async function scanKeys(): Promise<SshKeyInfo[]> {
  const dir = sshDir();
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }

  const profiles = getProfiles();
  const agentKeys = await listAgentKeys().catch(() => []);
  const agentFingerprints = new Set(agentKeys.map((k) => k.fingerprint));

  const pubFiles = new Set(entries.filter((e) => e.endsWith('.pub')));
  const keyNames = new Set<string>();

  for (const entry of entries) {
    if (NOT_KEYS.has(entry) || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    if (entry.endsWith('.pub')) keyNames.add(entry.slice(0, -4));
    else if (looksLikePrivateKey(full)) keyNames.add(entry);
  }

  const results: SshKeyInfo[] = [];
  for (const name of [...keyNames].sort()) {
    const privPath = path.join(dir, name);
    const pubName = name + '.pub';
    const hasPub = pubFiles.has(pubName);
    const pubPath = hasPub ? path.join(dir, pubName) : null;
    const hasPriv = fs.existsSync(privPath) && looksLikePrivateKey(privPath);

    const fp = pubPath
      ? await fingerprintOf(pubPath)
      : hasPriv
        ? await fingerprintOf(privPath)
        : { bits: null, fingerprint: null, comment: null, algorithm: null };

    let createdAt: string | null = null;
    try {
      const st = fs.statSync(hasPriv ? privPath : pubPath!);
      createdAt = st.birthtime.toISOString();
    } catch {
      /* ignore */
    }

    const usedBy = profiles
      .filter((p) => normalizeKeyPath(p.identityFile) === privPath)
      .map((p) => p.name);

    results.push({
      name,
      privateKeyPath: privPath,
      publicKeyPath: pubPath,
      algorithm: fp.algorithm ?? 'unknown',
      bits: fp.bits,
      fingerprint: fp.fingerprint,
      comment: fp.comment,
      createdAt,
      hasPrivateKey: hasPriv,
      usedByProfiles: usedBy,
      loadedInAgent: fp.fingerprint !== null && agentFingerprints.has(fp.fingerprint),
    });
  }
  return results;
}

export function normalizeKeyPath(p: string): string {
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export async function generateKey(req: GenerateKeyRequest): Promise<GenerateKeyResult> {
  const safeName = req.fileName.replace(/[^A-Za-z0-9._-]/g, '_');
  if (!safeName) throw new Error('Key file name is empty.');
  const dir = sshDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const privPath = path.join(dir, safeName);
  if (fs.existsSync(privPath)) {
    throw new Error(`A key named "${safeName}" already exists at ${privPath}.`);
  }

  const args =
    req.algorithm === 'ed25519'
      ? ['-t', 'ed25519']
      : ['-t', 'rsa', '-b', '4096'];
  args.push('-f', privPath, '-C', req.comment || safeName, '-N', req.passphrase ?? '');

  const res = await run('ssh-keygen', args, 30000);
  if (res.code !== 0) {
    throw new Error(`ssh-keygen failed: ${res.stderr || res.stdout}`.trim());
  }
  const pubPath = privPath + '.pub';
  const publicKey = fs.readFileSync(pubPath, 'utf8').trim();
  return { privateKeyPath: privPath, publicKeyPath: pubPath, publicKey };
}

export function readPublicKey(pubPath: string): string {
  return fs.readFileSync(pubPath, 'utf8').trim();
}

export async function findDuplicates(): Promise<DuplicateGroup[]> {
  const keys = await scanKeys();
  const byFp = new Map<string, string[]>();
  for (const k of keys) {
    if (!k.fingerprint) continue;
    const list = byFp.get(k.fingerprint) ?? [];
    list.push(k.name);
    byFp.set(k.fingerprint, list);
  }
  return [...byFp.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([fingerprint, names]) => ({ fingerprint, keys: names }));
}
