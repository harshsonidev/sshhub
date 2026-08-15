import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../toast';
import type { SshConfigSnapshot } from '../../../shared/types';

export function ConfigPage() {
  const [snapshot, setSnapshot] = useState<SshConfigSnapshot | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const toast = useToast();

  const refresh = useCallback(() => {
    api.readConfig().then(setSnapshot).catch((e) => toast(e.message, 'err'));
  }, [toast]);

  useEffect(refresh, [refresh]);

  if (!snapshot) return <div className="empty">Reading ~/.ssh/config…</div>;

  return (
    <div>
      <div className="page-title">SSH Config</div>
      <div className="page-sub">
        Visual view of <span className="mono">{snapshot.path}</span>. Entries marked “managed” are owned by
        SSHHub profiles; everything else is left untouched.
      </div>

      <div className="toolbar">
        <button className="btn" onClick={refresh}>Reload</button>
        <button className="btn" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? 'Hide raw file' : 'Show raw file'}
        </button>
      </div>

      <div className="card">
        {snapshot.hosts.length === 0 ? (
          <div className="empty">
            <div className="big">📄</div>
            {snapshot.exists ? 'No Host entries in your SSH config.' : 'No ~/.ssh/config file yet — create a profile and SSHHub will write one.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Alias</th><th>HostName</th><th>User</th><th>IdentityFile</th><th>Port</th><th>Source</th></tr>
            </thead>
            <tbody>
              {snapshot.hosts.map((h, i) => (
                <tr key={`${h.alias}-${i}`} className="row-hover">
                  <td className="mono" style={{ fontWeight: 600 }}>{h.alias}</td>
                  <td className="mono dim">{h.hostName ?? '—'}</td>
                  <td className="mono dim">{h.user ?? '—'}</td>
                  <td className="mono dim small">{h.identityFile ?? '—'}</td>
                  <td className="dim">{h.port ?? '—'}</td>
                  <td>
                    {h.managedByProfileId
                      ? <span className="badge accent">managed by SSHHub</span>
                      : <span className="badge dim">manual</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showRaw && (
        <div className="card">
          <h3>Raw file</h3>
          <pre className="output" style={{ maxHeight: 420 }}>{snapshot.raw || '(empty)'}</pre>
        </div>
      )}
    </div>
  );
}
