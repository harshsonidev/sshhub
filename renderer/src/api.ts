import type {
  AgentKey,
  AwsProfile,
  ConfigBackup,
  ConnectionTestResult,
  DuplicateGroup,
  GenerateKeyRequest,
  GenerateKeyResult,
  Profile,
  RepoInfo,
  Settings,
  SshConfigSnapshot,
  SshKeyInfo,
} from '../../shared/types';

export interface SshHubApi {
  scanKeys(): Promise<SshKeyInfo[]>;
  generateKey(req: GenerateKeyRequest): Promise<GenerateKeyResult>;
  readPublicKey(pubPath: string): Promise<string>;
  findDuplicates(): Promise<DuplicateGroup[]>;

  listProfiles(): Promise<Profile[]>;
  saveProfile(profile: Profile): Promise<Profile[]>;
  deleteProfile(id: string): Promise<Profile[]>;

  readConfig(): Promise<SshConfigSnapshot>;
  listBackups(): Promise<ConfigBackup[]>;
  backupNow(): Promise<ConfigBackup | null>;
  restoreBackup(fileName: string): Promise<void>;

  listAgentKeys(): Promise<AgentKey[]>;
  addAgentKey(keyPath: string): Promise<string>;
  removeAgentKey(keyPath: string): Promise<string>;

  testConnection(alias: string, user: string | null): Promise<ConnectionTestResult>;

  scanRepos(root: string): Promise<RepoInfo[]>;
  convertUrl(url: string, alias: string, user: string): Promise<string | null>;
  setRemote(repoPath: string, remoteName: string, url: string): Promise<void>;

  listAwsProfiles(): Promise<AwsProfile[]>;

  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;

  copyToClipboard(text: string): Promise<void>;
  pickDirectory(): Promise<string | null>;
  revealFile(p: string): Promise<void>;
}

declare global {
  interface Window {
    sshhub: SshHubApi;
  }
}

export const api: SshHubApi = window.sshhub;
