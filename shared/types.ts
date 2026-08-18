// Shared types between main, preload, and renderer.

export type Provider =
  | 'github'
  | 'gitlab'
  | 'bitbucket'
  | 'aws-codecommit'
  | 'aws-ec2'
  | 'azure-vm'
  | 'digitalocean'
  | 'generic';

export interface ProviderTemplate {
  id: Provider;
  label: string;
  defaultHostName: string;
  defaultUser: string;
  testable: boolean;
}

export interface SshKeyInfo {
  name: string;
  privateKeyPath: string;
  publicKeyPath: string | null;
  algorithm: string;
  bits: number | null;
  fingerprint: string | null;
  comment: string | null;
  createdAt: string | null;
  hasPrivateKey: boolean;
  usedByProfiles: string[];
  loadedInAgent: boolean;
}

export interface Profile {
  id: string;
  name: string;
  provider: Provider;
  alias: string;
  hostName: string;
  user: string;
  identityFile: string;
  port: number | null;
}

export interface SshConfigHost {
  alias: string;
  hostName: string | null;
  user: string | null;
  identityFile: string | null;
  port: number | null;
  managedByProfileId: string | null;
  rawLines: string[];
}

export interface SshConfigSnapshot {
  path: string;
  exists: boolean;
  hosts: SshConfigHost[];
  raw: string;
}

export interface ConfigBackup {
  fileName: string;
  createdAt: string;
  sizeBytes: number;
}

export interface AgentKey {
  bits: number;
  fingerprint: string;
  comment: string;
  algorithm: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  exitCode: number | null;
  output: string;
  summary: string;
}

export interface RepoInfo {
  path: string;
  name: string;
  remoteName: string;
  remoteUrl: string;
  matchedProfileId: string | null;
  matchedProfileName: string | null;
}

export interface RepoIdentity {
  name: string | null;
  email: string | null;
  globalName: string | null;
  globalEmail: string | null;
}

export interface AwsProfile {
  name: string;
  region: string | null;
  source: 'config' | 'credentials';
  mappedKeyPath: string | null;
}

export interface DuplicateGroup {
  fingerprint: string;
  keys: string[];
}

export interface GenerateKeyRequest {
  algorithm: 'ed25519' | 'rsa';
  fileName: string;
  comment: string;
  passphrase: string;
}

export interface GenerateKeyResult {
  privateKeyPath: string;
  publicKeyPath: string;
  publicKey: string;
}

export interface Settings {
  repoScanRoot: string | null;
  awsKeyMappings: Record<string, string>;
  loadKeysAtStartup: string[];
}

export interface StoreShape {
  profiles: Profile[];
  settings: Settings;
}

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  { id: 'github', label: 'GitHub', defaultHostName: 'github.com', defaultUser: 'git', testable: true },
  { id: 'gitlab', label: 'GitLab', defaultHostName: 'gitlab.com', defaultUser: 'git', testable: true },
  { id: 'bitbucket', label: 'Bitbucket', defaultHostName: 'bitbucket.org', defaultUser: 'git', testable: true },
  // User must be the IAM SSH public key ID (APKA…); HostName is per-region.
  { id: 'aws-codecommit', label: 'AWS CodeCommit', defaultHostName: 'git-codecommit.us-east-1.amazonaws.com', defaultUser: '', testable: true },
  { id: 'aws-ec2', label: 'AWS EC2', defaultHostName: '', defaultUser: 'ec2-user', testable: false },
  { id: 'azure-vm', label: 'Azure VM', defaultHostName: '', defaultUser: 'azureuser', testable: false },
  { id: 'digitalocean', label: 'DigitalOcean', defaultHostName: '', defaultUser: 'root', testable: false },
  { id: 'generic', label: 'Generic Linux Server', defaultHostName: '', defaultUser: '', testable: false },
];
