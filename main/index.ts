import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as store from './store';
import * as keys from './ssh/keys';
import * as sshConfig from './ssh/config';
import * as agent from './ssh/agent';
import { testConnection } from './ssh/test';
import { scanRepos, convertUrl, setRemoteUrl, getRepoIdentity, setRepoIdentity } from './git/scanner';
import { listAwsProfiles } from './aws/profiles';
import { Profile, GenerateKeyRequest } from '../shared/types';

// Errors thrown inside ipcMain.handle reach the renderer wrapped and prefixed;
// route through a helper so the renderer gets clean messages.
function handle(channel: string, fn: (...args: any[]) => any) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

function registerIpc(getWindow: () => BrowserWindow | null) {
  handle('keys:scan', () => keys.scanKeys());
  handle('keys:generate', (req: GenerateKeyRequest) => keys.generateKey(req));
  handle('keys:readPublic', (pubPath: string) => keys.readPublicKey(pubPath));
  handle('keys:duplicates', () => keys.findDuplicates());

  handle('profiles:list', () => store.getProfiles());
  handle('profiles:save', (profile: Profile) => {
    if (!profile.id) profile.id = randomUUID();
    if (!/^[A-Za-z0-9._-]+$/.test(profile.alias)) {
      throw new Error('Alias may only contain letters, digits, dots, dashes and underscores.');
    }
    if (!profile.hostName) throw new Error('HostName is required.');
    if (/[*?\s]/.test(profile.hostName)) {
      throw new Error(
        'HostName must be a concrete host, not a wildcard pattern — e.g. git-codecommit.us-east-1.amazonaws.com. (Wildcards only work on Host lines in ssh config; SSHHub aliases replace that need.)'
      );
    }
    const saved = store.saveProfile(profile);
    sshConfig.upsertProfileHost(profile);
    return saved;
  });
  handle('profiles:delete', (id: string) => {
    sshConfig.removeProfileHost(id);
    return store.deleteProfile(id);
  });

  handle('config:read', () => sshConfig.readConfig());
  handle('config:backups', () => sshConfig.listBackups());
  handle('config:backupNow', () => sshConfig.backupConfig());
  handle('config:restore', (fileName: string) => sshConfig.restoreBackup(fileName));

  handle('agent:list', () => agent.listAgentKeys());
  handle('agent:add', (keyPath: string) => agent.addKeyToAgent(keyPath));
  handle('agent:remove', (keyPath: string) => agent.removeKeyFromAgent(keyPath));

  handle('test:connection', (alias: string, user: string | null) => testConnection(alias, user));

  handle('repos:scan', (root: string) => scanRepos(root));
  handle('repos:convertUrl', (url: string, alias: string, user: string) => convertUrl(url, alias, user));
  handle('repos:setRemote', (repoPath: string, remoteName: string, url: string) =>
    setRemoteUrl(repoPath, remoteName, url)
  );
  handle('repos:getIdentity', (repoPath: string) => getRepoIdentity(repoPath));
  handle('repos:setIdentity', (repoPath: string, name: string, email: string) =>
    setRepoIdentity(repoPath, name, email)
  );

  handle('aws:profiles', () => listAwsProfiles());

  handle('settings:get', () => store.getSettings());
  handle('settings:update', (patch: object) => store.updateSettings(patch));

  handle('util:copy', (text: string) => clipboard.writeText(text));
  handle('util:pickDirectory', async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] });
    return res.canceled ? null : res.filePaths[0];
  });
  handle('util:revealFile', (p: string) => shell.showItemInFolder(p));
}

async function loadStartupKeys() {
  const wanted = store.getSettings().loadKeysAtStartup;
  for (const keyPath of wanted) {
    await agent.addKeyToAgent(keyPath).catch(() => undefined);
  }
}

// In dev the macOS app menu still reads "Electron" (it comes from the dev
// bundle's Info.plist); packaged builds show SSHHub everywhere.
app.setName('SSHHub');
app.setAboutPanelOptions({ applicationName: 'SSHHub', applicationVersion: app.getVersion() });

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    title: 'SSHHub',
    backgroundColor: '#0e1116',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }
  mainWindow.on('closed', () => (mainWindow = null));
}

// Packaged builds get the icon from electron-builder; in dev, set the macOS
// dock icon by hand so the app is recognizable while developing.
function setDevDockIcon() {
  if (app.isPackaged || process.platform !== 'darwin' || !app.dock) return;
  const icon = path.join(__dirname, '../../../build/icon.png');
  try {
    app.dock.setIcon(icon);
  } catch {
    /* missing icon in odd layouts is fine */
  }
}

app.whenReady().then(() => {
  registerIpc(() => mainWindow);
  setDevDockIcon();
  createWindow();
  loadStartupKeys();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
