import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../toast';
import type { AwsProfile, Settings, SshKeyInfo } from '../../../shared/types';

export function AwsPage() {
  const [awsProfiles, setAwsProfiles] = useState<AwsProfile[] | null>(null);
  const [keys, setKeys] = useState<SshKeyInfo[]>([]);
  const toast = useToast();

  const refresh = useCallback(() => {
    api.listAwsProfiles().then(setAwsProfiles).catch((e) => toast(e.message, 'err'));
    api.scanKeys().then(setKeys).catch(() => {});
  }, [toast]);

  useEffect(refresh, [refresh]);

  const mapKey = async (awsProfile: string, keyPath: string) => {
    const settings: Settings = await api.getSettings();
    const mappings = { ...settings.awsKeyMappings };
    if (keyPath) mappings[awsProfile] = keyPath;
    else delete mappings[awsProfile];
    await api.updateSettings({ awsKeyMappings: mappings });
    refresh();
  };

  return (
    <div>
      <div className="page-title">AWS</div>
      <div className="page-sub">
        Profiles detected from <span className="mono">~/.aws/config</span> and{' '}
        <span className="mono">~/.aws/credentials</span>. Map each environment to the SSH key you use for its
        EC2 instances and bastion hosts. Credentials are never read — only section names.
      </div>

      <div className="card">
        {awsProfiles === null ? (
          <div className="empty">Reading AWS config…</div>
        ) : awsProfiles.length === 0 ? (
          <div className="empty">
            <div className="big">☁️</div>
            No AWS profiles found — nothing in ~/.aws/config or ~/.aws/credentials.
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>AWS Profile</th><th>Region</th><th>Source</th><th>Mapped SSH key</th></tr>
            </thead>
            <tbody>
              {awsProfiles.map((p) => (
                <tr key={p.name} className="row-hover">
                  <td className="mono" style={{ fontWeight: 600 }}>{p.name}</td>
                  <td className="dim">{p.region ?? '—'}</td>
                  <td><span className="badge dim">{p.source}</span></td>
                  <td>
                    <select
                      value={p.mappedKeyPath ?? ''}
                      onChange={(e) => mapKey(p.name, e.target.value)}
                      style={{ font: 'inherit', padding: '5px 8px', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
                    >
                      <option value="">— none —</option>
                      {keys.filter((k) => k.hasPrivateKey).map((k) => (
                        <option key={k.privateKeyPath} value={k.privateKeyPath}>{k.name}</option>
                      ))}
                    </select>
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
