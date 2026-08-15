import { contextBridge, ipcRenderer } from 'electron';

// Every channel returns { ok, data } | { ok, error }; unwrap here so the
// renderer works with plain promises that reject with clean messages.
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as
    | { ok: true; data: T }
    | { ok: false; error: string };
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

const api = {
  scanKeys: () => invoke('keys:scan'),
  generateKey: (req: unknown) => invoke('keys:generate', req),
  readPublicKey: (pubPath: string) => invoke('keys:readPublic', pubPath),
  findDuplicates: () => invoke('keys:duplicates'),

  listProfiles: () => invoke('profiles:list'),
  saveProfile: (profile: unknown) => invoke('profiles:save', profile),
  deleteProfile: (id: string) => invoke('profiles:delete', id),

  readConfig: () => invoke('config:read'),
  listBackups: () => invoke('config:backups'),
  backupNow: () => invoke('config:backupNow'),
  restoreBackup: (fileName: string) => invoke('config:restore', fileName),

  listAgentKeys: () => invoke('agent:list'),
  addAgentKey: (keyPath: string) => invoke('agent:add', keyPath),
  removeAgentKey: (keyPath: string) => invoke('agent:remove', keyPath),

  testConnection: (alias: string, user: string | null) => invoke('test:connection', alias, user),

  scanRepos: (root: string) => invoke('repos:scan', root),
  convertUrl: (url: string, alias: string, user: string) => invoke('repos:convertUrl', url, alias, user),
  setRemote: (repoPath: string, remoteName: string, url: string) =>
    invoke('repos:setRemote', repoPath, remoteName, url),

  listAwsProfiles: () => invoke('aws:profiles'),

  getSettings: () => invoke('settings:get'),
  updateSettings: (patch: unknown) => invoke('settings:update', patch),

  copyToClipboard: (text: string) => invoke('util:copy', text),
  pickDirectory: () => invoke('util:pickDirectory'),
  revealFile: (p: string) => invoke('util:revealFile', p),
};

contextBridge.exposeInMainWorld('sshhub', api);

export type SshHubApi = typeof api;
