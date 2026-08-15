import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../toast';
import { Modal } from '../components/Modal';
import type { Profile, RepoInfo } from '../../../shared/types';

export function ReposPage() {
  const [root, setRoot] = useState<string | null>(null);
  const [repos, setRepos] = useState<RepoInfo[] | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [scanning, setScanning] = useState(false);
  const [converting, setConverting] = useState<RepoInfo | null>(null);
  const toast = useToast();

  useEffect(() => {
    api.getSettings().then((s) => setRoot(s.repoScanRoot)).catch(() => {});
    api.listProfiles().then(setProfiles).catch(() => {});
  }, []);

  const scan = useCallback(async (dir: string) => {
    setScanning(true);
    try {
      setRepos(await api.scanRepos(dir));
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setScanning(false);
    }
  }, [toast]);

  useEffect(() => {
    if (root) scan(root);
  }, [root, scan]);

  const pickRoot = async () => {
    const dir = await api.pickDirectory();
    if (!dir) return;
    setRoot(dir);
    api.updateSettings({ repoScanRoot: dir }).catch(() => {});
  };

  return (
    <div>
      <div className="page-title">Repositories</div>
      <div className="page-sub">Scan local git repositories and see which SSH profile each remote resolves to.</div>

      <div className="toolbar">
        <button className="btn primary" onClick={pickRoot}>Choose folder to scan…</button>
        {root && <span className="mono dim small">{root}</span>}
        <div className="spacer" />
        {root && <button className="btn" disabled={scanning} onClick={() => scan(root)}>{scanning ? 'Scanning…' : 'Rescan'}</button>}
      </div>

      <div className="card">
        {!root ? (
          <div className="empty">
            <div className="big">📦</div>
            Pick a folder (e.g. ~/code) to discover your git repositories.
          </div>
        ) : repos === null || scanning ? (
          <div className="empty">Scanning for repositories…</div>
        ) : repos.length === 0 ? (
          <div className="empty">No git repositories found under {root}.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Repository</th><th>Remote</th><th>URL</th><th>SSH Profile</th><th></th></tr>
            </thead>
            <tbody>
              {repos.map((r) => (
                <tr key={`${r.path}-${r.remoteName}`} className="row-hover">
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td className="dim">{r.remoteName}</td>
                  <td className="mono dim small" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.remoteUrl}
                  </td>
                  <td>
                    {r.matchedProfileName
                      ? <span className="badge accent">→ {r.matchedProfileName}</span>
                      : <span className="badge dim">unmapped</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn sm" onClick={() => setConverting(r)}>Switch profile…</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {converting && (
        <ConvertModal
          repo={converting}
          profiles={profiles}
          onClose={() => setConverting(null)}
          onDone={() => { setConverting(null); if (root) scan(root); }}
        />
      )}
    </div>
  );
}

function ConvertModal({ repo, profiles, onClose, onDone }: {
  repo: RepoInfo;
  profiles: Profile[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = profiles.find((p) => p.id === profileId) ?? null;

  useEffect(() => {
    if (!selected) { setPreview(null); return; }
    api.convertUrl(repo.remoteUrl, selected.alias, selected.user).then(setPreview).catch(() => setPreview(null));
  }, [repo.remoteUrl, selected]);

  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await api.setRemote(repo.path, repo.remoteName, preview);
      toast(`${repo.name}: remote "${repo.remoteName}" now uses ${selected!.name}`);
      onDone();
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Switch SSH profile — ${repo.name}`} onClose={onClose}>
      {profiles.length === 0 ? (
        <p className="dim">Create a profile first, then convert repository remotes to use it.</p>
      ) : (
        <>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Profile</label>
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.alias})</option>)}
            </select>
          </div>
          <div className="kv small">
            <span className="k">Current URL</span>
            <span className="mono">{repo.remoteUrl}</span>
            <span className="k">New URL</span>
            <span className="mono">{preview ?? '⚠️ URL format not recognized'}</span>
          </div>
        </>
      )}
      <div className="actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!preview || busy} onClick={apply}>
          {busy ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </Modal>
  );
}
