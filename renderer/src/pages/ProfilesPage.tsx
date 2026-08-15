import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../toast';
import { Modal } from '../components/Modal';
import type { ConnectionTestResult, Profile, Provider, SshKeyInfo } from '../../../shared/types';
import { PROVIDER_TEMPLATES } from '../../../shared/types';

const EMPTY: Profile = {
  id: '',
  name: '',
  provider: 'github',
  alias: '',
  hostName: 'github.com',
  user: 'git',
  identityFile: '',
  port: null,
};

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [keys, setKeys] = useState<SshKeyInfo[]>([]);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ profile: Profile; result: ConnectionTestResult } | null>(null);
  const toast = useToast();

  const refresh = useCallback(() => {
    api.listProfiles().then(setProfiles).catch((e) => toast(e.message, 'err'));
    api.scanKeys().then(setKeys).catch(() => {});
  }, [toast]);

  useEffect(refresh, [refresh]);

  const test = async (p: Profile) => {
    setTesting(p.id);
    try {
      const result = await api.testConnection(p.alias, p.user || null);
      setTestResult({ profile: p, result });
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setTesting(null);
    }
  };

  const remove = async (p: Profile) => {
    if (!confirm(`Delete profile "${p.name}"? Its Host entry will be removed from ~/.ssh/config (a backup is taken first). Keys are not touched.`)) return;
    try {
      setProfiles(await api.deleteProfile(p.id));
      toast(`Profile "${p.name}" deleted`);
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  return (
    <div>
      <div className="page-title">Profiles</div>
      <div className="page-sub">
        Each profile writes a managed Host entry to ~/.ssh/config. Use the alias in git URLs, e.g.{' '}
        <span className="mono">git clone git@github-work:org/repo.git</span>
      </div>

      <div className="toolbar">
        <button className="btn primary" onClick={() => setEditing({ ...EMPTY })}>+ New Profile</button>
      </div>

      <div className="card">
        {profiles.length === 0 ? (
          <div className="empty">
            <div className="big">👤</div>
            No profiles yet. Create one to stop editing ~/.ssh/config by hand.
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Name</th><th>Provider</th><th>Alias</th><th>Host</th><th>Key</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="row-hover">
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td><span className="badge dim">{PROVIDER_TEMPLATES.find((t) => t.id === p.provider)?.label ?? p.provider}</span></td>
                  <td className="mono">{p.alias}</td>
                  <td className="mono dim small">{p.user ? `${p.user}@` : ''}{p.hostName}{p.port ? `:${p.port}` : ''}</td>
                  <td className="mono dim small">{p.identityFile.split('/').pop()}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn sm" disabled={testing === p.id} onClick={() => test(p)}>
                      {testing === p.id ? 'Testing…' : 'Test'}
                    </button>{' '}
                    <button className="btn sm" onClick={() => setEditing({ ...p })}>Edit</button>{' '}
                    <button className="btn sm danger" onClick={() => remove(p)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <ProfileEditor
          profile={editing}
          keys={keys}
          onClose={() => setEditing(null)}
          onSaved={(list) => { setProfiles(list); setEditing(null); }}
        />
      )}

      {testResult && (
        <Modal title={`Connection test — ${testResult.profile.name}`} onClose={() => setTestResult(null)}>
          <p style={{ marginBottom: 12 }}>
            {testResult.result.ok
              ? <span className="badge ok">✓ {testResult.result.summary}</span>
              : <span className="badge err">✗ {testResult.result.summary}</span>}
          </p>
          <pre className="output">{testResult.result.output}</pre>
          <div className="actions">
            <button className="btn primary" onClick={() => setTestResult(null)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProfileEditor({ profile, keys, onClose, onSaved }: {
  profile: Profile;
  keys: SshKeyInfo[];
  onClose: () => void;
  onSaved: (profiles: Profile[]) => void;
}) {
  const [p, setP] = useState(profile);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const isNew = !p.id;

  const set = (patch: Partial<Profile>) => setP((prev) => ({ ...prev, ...patch }));

  const applyTemplate = (provider: Provider) => {
    const t = PROVIDER_TEMPLATES.find((x) => x.id === provider)!;
    set({
      provider,
      hostName: t.defaultHostName || p.hostName,
      user: t.defaultUser || p.user,
    });
  };

  const suggestedAlias = (name: string, provider: Provider) => {
    const base = PROVIDER_TEMPLATES.find((t) => t.id === provider)?.label.toLowerCase().replace(/\s+/g, '') ?? provider;
    const suffix = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return suffix ? `${base}-${suffix}` : '';
  };

  const save = async () => {
    setBusy(true);
    try {
      const list = await api.saveProfile(p);
      toast(`Profile "${p.name}" saved — ~/.ssh/config updated (backup taken)`);
      onSaved(list);
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={isNew ? 'New Profile' : `Edit Profile — ${profile.name}`} onClose={onClose}>
      <div className="form-grid">
        <div className="field">
          <label>Provider</label>
          <select value={p.provider} onChange={(e) => applyTemplate(e.target.value as Provider)}>
            {PROVIDER_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Profile name</label>
          <input
            placeholder="e.g. GitHub Work"
            value={p.name}
            autoFocus={isNew}
            onChange={(e) => {
              const name = e.target.value;
              set(isNew ? { name, alias: suggestedAlias(name, p.provider) } : { name });
            }}
          />
        </div>
        <div className="field">
          <label>Host alias</label>
          <input
            placeholder="e.g. github-work"
            value={p.alias}
            onChange={(e) => set({ alias: e.target.value })}
          />
          <span className="hint">Used as: git@{p.alias || 'alias'}:org/repo.git</span>
        </div>
        <div className="field">
          <label>HostName</label>
          <input placeholder="e.g. github.com" value={p.hostName} onChange={(e) => set({ hostName: e.target.value })} />
          {/[*?]/.test(p.hostName) ? (
            <span className="hint" style={{ color: 'var(--err)' }}>
              Wildcards don’t resolve — use a real host, e.g. git-codecommit.us-east-1.amazonaws.com.
            </span>
          ) : p.provider === 'aws-codecommit' ? (
            <span className="hint">Region-specific: git-codecommit.&lt;region&gt;.amazonaws.com</span>
          ) : null}
        </div>
        <div className="field">
          <label>User</label>
          <input
            placeholder={p.provider === 'aws-codecommit' ? 'APKA… (IAM SSH key ID)' : 'e.g. git'}
            value={p.user}
            onChange={(e) => set({ user: e.target.value })}
          />
          {p.provider === 'aws-codecommit' && (
            <span
              className="hint"
              style={p.user && !p.user.startsWith('APKA') ? { color: 'var(--warn)' } : undefined}
            >
              Must be your IAM SSH public key ID (APKA…), not “git” (IAM → Security credentials → SSH keys for CodeCommit).
            </span>
          )}
        </div>
        <div className="field">
          <label>Port (optional)</label>
          <input
            placeholder="22"
            value={p.port ?? ''}
            onChange={(e) => set({ port: e.target.value ? parseInt(e.target.value, 10) || null : null })}
          />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>SSH Key</label>
          <select value={p.identityFile} onChange={(e) => set({ identityFile: e.target.value })}>
            <option value="">— select a key —</option>
            {keys.filter((k) => k.hasPrivateKey).map((k) => (
              <option key={k.privateKeyPath} value={k.privateKeyPath}>
                {k.name} ({k.algorithm})
              </option>
            ))}
          </select>
          <span className="hint">Generate keys from the SSH Keys page if none fit.</span>
        </div>
      </div>
      <div className="actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button
          className="btn primary"
          disabled={busy || !p.name.trim() || !p.alias.trim() || !p.hostName.trim() || /[*?]/.test(p.hostName) || !p.identityFile}
          onClick={save}
        >
          {busy ? 'Saving…' : 'Save & Update SSH Config'}
        </button>
      </div>
    </Modal>
  );
}
