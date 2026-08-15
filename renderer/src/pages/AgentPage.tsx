import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../toast';
import type { AgentKey, Settings, SshKeyInfo } from '../../../shared/types';

export function AgentPage() {
  const [agentKeys, setAgentKeys] = useState<AgentKey[] | null>(null);
  const [diskKeys, setDiskKeys] = useState<SshKeyInfo[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  const refresh = useCallback(() => {
    api.listAgentKeys().then(setAgentKeys).catch((e) => toast(e.message, 'err'));
    api.scanKeys().then(setDiskKeys).catch(() => {});
    api.getSettings().then(setSettings).catch(() => {});
  }, [toast]);

  useEffect(refresh, [refresh]);

  const act = async (label: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(label);
    try {
      await fn();
      toast(okMsg);
      refresh();
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(null);
    }
  };

  const toggleStartup = async (keyPath: string) => {
    if (!settings) return;
    const list = settings.loadKeysAtStartup.includes(keyPath)
      ? settings.loadKeysAtStartup.filter((k) => k !== keyPath)
      : [...settings.loadKeysAtStartup, keyPath];
    setSettings(await api.updateSettings({ loadKeysAtStartup: list }));
  };

  const loadable = diskKeys.filter((k) => k.hasPrivateKey);

  return (
    <div>
      <div className="page-title">SSH Agent</div>
      <div className="page-sub">Keys currently loaded in your ssh-agent (<span className="mono">ssh-add -l</span>).</div>

      <div className="toolbar">
        <button className="btn" onClick={refresh}>Refresh</button>
      </div>

      <div className="card">
        <h3>Loaded in agent</h3>
        {agentKeys === null ? (
          <div className="empty">Querying agent…</div>
        ) : agentKeys.length === 0 ? (
          <div className="empty">The agent has no identities loaded (or is not running).</div>
        ) : (
          <table>
            <thead><tr><th>Comment</th><th>Algorithm</th><th>Fingerprint</th></tr></thead>
            <tbody>
              {agentKeys.map((k) => (
                <tr key={k.fingerprint} className="row-hover">
                  <td>{k.comment || <span className="dim">—</span>}</td>
                  <td><span className="badge dim">{k.algorithm} {k.bits}</span></td>
                  <td className="mono dim small">{k.fingerprint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Keys on disk</h3>
        {loadable.length === 0 ? (
          <div className="empty">No private keys found in ~/.ssh.</div>
        ) : (
          <table>
            <thead><tr><th>Key</th><th>Status</th><th>Load at startup</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {loadable.map((k) => (
                <tr key={k.privateKeyPath} className="row-hover">
                  <td className="mono">{k.name}</td>
                  <td>
                    {k.loadedInAgent
                      ? <span className="badge ok">loaded</span>
                      : <span className="badge dim">not loaded</span>}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={settings?.loadKeysAtStartup.includes(k.privateKeyPath) ?? false}
                      onChange={() => toggleStartup(k.privateKeyPath)}
                    />
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {k.loadedInAgent ? (
                      <>
                        <button
                          className="btn sm"
                          disabled={busy !== null}
                          onClick={() => act(k.name, async () => {
                            await api.removeAgentKey(k.privateKeyPath);
                            await api.addAgentKey(k.privateKeyPath);
                          }, `${k.name} reloaded`)}
                        >
                          Reload
                        </button>{' '}
                        <button
                          className="btn sm danger"
                          disabled={busy !== null}
                          onClick={() => act(k.name, () => api.removeAgentKey(k.privateKeyPath), `${k.name} removed from agent`)}
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn sm"
                        disabled={busy !== null}
                        onClick={() => act(k.name, () => api.addAgentKey(k.privateKeyPath), `${k.name} added to agent`)}
                      >
                        {busy === k.name ? 'Adding…' : 'Add to agent'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
