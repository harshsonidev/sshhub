import * as fs from 'fs';
import * as path from 'path';
import { run } from '../exec';
import { getProfiles } from '../store';
import { Profile, RepoIdentity, RepoInfo } from '../../shared/types';

const SKIP_DIRS = new Set(['node_modules', '.Trash', 'Library', '.cache', '.npm', 'vendor']);

function findGitRepos(root: string, maxDepth: number): string[] {
  const repos: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth || repos.length >= 500) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.name === '.git')) {
      repos.push(dir);
      return; // don't descend into a repo looking for nested repos
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.isSymbolicLink()) continue;
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), depth + 1);
    }
  };
  walk(root, 0);
  return repos;
}

// Match a remote URL to a profile: ssh URLs by alias or hostname+key intent,
// https URLs by hostname only (candidate for conversion).
function matchProfile(remoteUrl: string, profiles: Profile[]): Profile | null {
  const sshMatch = remoteUrl.match(/^(?:ssh:\/\/)?(?:([^@]+)@)?([^:/]+)[:/]/);
  if (!sshMatch) return null;
  const host = sshMatch[2];
  return (
    profiles.find((p) => p.alias === host) ??
    profiles.find((p) => p.hostName === host) ??
    null
  );
}

export async function scanRepos(root: string): Promise<RepoInfo[]> {
  const profiles = getProfiles();
  const repoPaths = findGitRepos(root, 4);
  const results: RepoInfo[] = [];
  for (const repoPath of repoPaths) {
    const res = await run('git', ['-C', repoPath, 'remote', '-v'], 8000);
    if (res.code !== 0) continue;
    const seen = new Set<string>();
    for (const line of res.stdout.split('\n')) {
      const m = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)$/);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      const matched = matchProfile(m[2], profiles);
      results.push({
        path: repoPath,
        name: path.basename(repoPath),
        remoteName: m[1],
        remoteUrl: m[2],
        matchedProfileId: matched?.id ?? null,
        matchedProfileName: matched?.name ?? null,
      });
    }
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

// https://github.com/org/repo.git -> git@<alias>:org/repo.git
// CodeCommit: https://git-codecommit.<region>.amazonaws.com/v1/repos/name
//   -> <ssh-key-id>@<alias>:v1/repos/name (no .git suffix)
export function convertUrl(remoteUrl: string, alias: string, user: string): string | null {
  // https://host/path, ssh://[user@]host[:port]/path, or scp-style [user@]host:path
  let m = remoteUrl.match(/^https?:\/\/[^/]+\/(.+?)(?:\.git)?\/?$/);
  if (!m) {
    m = remoteUrl.match(/^ssh:\/\/(?:[^@/]+@)?[^:/]+(?::\d+)?\/(.+?)(?:\.git)?\/?$/);
  }
  if (!m) {
    m = remoteUrl.match(/^(?:[^@/]+@)?[^:/]+:(.+?)(?:\.git)?\/?$/);
  }
  if (!m) return null;
  const path = m[1];
  const isCodeCommit = /git-codecommit\./.test(remoteUrl) || path.startsWith('v1/repos/');
  // CodeCommit rejects scp-style relative paths (auth succeeds, then "could not
  // read from remote repository") — it needs the absolute ssh:// form.
  if (isCodeCommit) return `ssh://${user || 'git'}@${alias}/${path}`;
  return `${user || 'git'}@${alias}:${path}.git`;
}

export async function setRemoteUrl(repoPath: string, remoteName: string, url: string): Promise<void> {
  const res = await run('git', ['-C', repoPath, 'remote', 'set-url', remoteName, url], 8000);
  if (res.code !== 0) throw new Error((res.stderr || res.stdout || 'git remote set-url failed').trim());
}

export async function getRepoIdentity(repoPath: string): Promise<RepoIdentity> {
  const get = async (args: string[]) => {
    const r = await run('git', args, 8000);
    return r.code === 0 ? r.stdout.trim() || null : null;
  };
  return {
    name: await get(['-C', repoPath, 'config', '--local', '--get', 'user.name']),
    email: await get(['-C', repoPath, 'config', '--local', '--get', 'user.email']),
    globalName: await get(['config', '--global', '--get', 'user.name']),
    globalEmail: await get(['config', '--global', '--get', 'user.email']),
  };
}

// Empty value clears the repo-local override so the global value applies again.
export async function setRepoIdentity(repoPath: string, name: string, email: string): Promise<void> {
  const apply = async (key: string, value: string) => {
    const res = value
      ? await run('git', ['-C', repoPath, 'config', '--local', key, value], 8000)
      : await run('git', ['-C', repoPath, 'config', '--local', '--unset', key], 8000);
    // exit 5 from --unset means the key wasn't set — nothing to clear
    if (res.code !== 0 && !(value === '' && res.code === 5)) {
      throw new Error((res.stderr || `git config ${key} failed`).trim());
    }
  };
  await apply('user.name', name.trim());
  await apply('user.email', email.trim());
}
