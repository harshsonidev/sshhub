import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../toast';
import type { ConfigBackup } from '../../../shared/types';

export function BackupsPage() {
  const [backups, setBackups] = useState<ConfigBackup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const refresh = useCallback(() => {
    api.listBackups().then(setBackups).catch((e) => toast(e.message, 'err'));
  }, [toast]);

  useEffect(refresh, [refresh]);

  const backupNow = async () => {
    setBusy(true);
    try {
      const b = await api.backupNow();
      toast(b ? `Backup created: ${b.fileName}` : 'No ~/.ssh/config file to back up yet');
      refresh();
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (b: ConfigBackup) => {
    if (!confirm(`Restore ~/.ssh/config from ${b.fileName}? The current file is backed up first.`)) return;
    setBusy(true);
    try {
      await api.restoreBackup(b.fileName);
      toast(`Restored ~/.ssh/config from ${b.fileName}`);
      refresh();
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-title">Config Backups</div>
      <div className="page-sub">
        SSHHub snapshots ~/.ssh/config automatically before every change it makes. Restore any version with one click.
      </div>

      <div className="toolbar">
        <button className="btn primary" disabled={busy} onClick={backupNow}>Back up now</button>
        <button className="btn" onClick={refresh}>Refresh</button>
      </div>

      <div className="card">
        {backups === null ? (
          <div className="empty">Loading…</div>
        ) : backups.length === 0 ? (
          <div className="empty">
            <div className="big">🕘</div>
            No backups yet. One will be created automatically the first time SSHHub touches your config.
          </div>
        ) : (
          <table>
            <thead><tr><th>File</th><th>Created</th><th>Size</th><th style={{ textAlign: 'right' }}></th></tr></thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.fileName} className="row-hover">
                  <td className="mono small">{b.fileName}</td>
                  <td className="dim">{new Date(b.createdAt).toLocaleString()}</td>
                  <td className="dim">{b.sizeBytes} B</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn sm" disabled={busy} onClick={() => restore(b)}>Restore</button>
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
