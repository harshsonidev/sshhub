import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../toast';
import { Modal } from '../components/Modal';
import type { DuplicateGroup, GenerateKeyResult, SshKeyInfo } from '../../../shared/types';
import { PROVIDER_TEMPLATES } from '../../../shared/types';

export function KeysPage() {
  const [keys, setKeys] = useState<SshKeyInfo[] | null>(null);
  const [dupes, setDupes] = useState<DuplicateGroup[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const toast = useToast();

  const refresh = useCallback(() => {
    api.scanKeys().then(setKeys).catch((e) => toast(e.message, 'err'));
    api.findDuplicates().then(setDupes).catch(() => {});
  }, [toast]);

  useEffect(refresh, [refresh]);

  const copyPub = async (k: SshKeyInfo) => {
    if (!k.publicKeyPath) return;
    const pub = await api.readPublicKey(k.publicKeyPath);
    await api.copyToClipboard(pub);
    toast(`Public key for ${k.name} copied to clipboard`);
  };

  return (
    <div>
      <div className="page-title">SSH Keys</div>
      <div className="page-sub">All keys discovered in ~/.ssh — imported automatically, never modified.</div>

      <div className="toolbar">
        <button className="btn primary" onClick={() => setWizardOpen(true)}>+ Generate New Key</button>
        <button className="btn" onClick={refresh}>Rescan</button>
      </div>

      <div className="card">
        {keys === null ? (
          <div className="empty">Scanning ~/.ssh…</div>
        ) : keys.length === 0 ? (
          <div className="empty">
            <div className="big">🔑</div>
            No SSH keys found in ~/.ssh.<br />Generate your first key to get started.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Algorithm</th><th>Fingerprint</th><th>Created</th><th>Used by</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.name} className="row-hover">
                  <td><span className="mono">{k.name}</span></td>
                  <td>
                    <span className="badge dim">{k.algorithm}{k.bits ? ` ${k.bits}` : ''}</span>
                  </td>
                  <td
                    className="mono dim small"
                    title={k.fingerprint ?? undefined}
                    style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {k.fingerprint ?? '—'}
                  </td>
                  <td className="dim small">{k.createdAt ? new Date(k.createdAt).toLocaleDateString() : '—'}</td>
                  <td className="small">
                    {k.usedByProfiles.length > 0
                      ? k.usedByProfiles.map((p) => <span key={p} className="badge accent" style={{ marginRight: 4 }}>{p}</span>)
                      : <span className="dim">unused</span>}
                  </td>
                  <td>
                    {!k.hasPrivateKey ? (
                      <span className="badge warn">public only</span>
                    ) : k.loadedInAgent ? (
                      <span className="badge ok">in agent</span>
                    ) : (
                      <span className="badge dim">on disk</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {k.publicKeyPath && (
                      <button className="btn sm" title="Copy public key to clipboard" onClick={() => copyPub(k)}>Copy key</button>
                    )}{' '}
                    <button className="btn sm" onClick={() => api.revealFile(k.privateKeyPath)}>Reveal</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dupes.length > 0 && (
        <div className="card">
          <h3>⚠️ Duplicate keys detected</h3>
          {dupes.map((d) => (
            <div key={d.fingerprint} style={{ marginBottom: 8 }}>
              <span className="mono small dim">{d.fingerprint}</span>
              <div className="small">
                Shared by: {d.keys.map((n) => <span key={n} className="badge warn" style={{ marginRight: 4 }}>{n}</span>)}
                <span className="dim"> — consider removing all but one.</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {wizardOpen && (
        <KeyWizard
          onClose={() => setWizardOpen(false)}
          onDone={() => { setWizardOpen(false); refresh(); }}
        />
      )}
    </div>
  );
}

function KeyWizard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState('github');
  const [profileName, setProfileName] = useState('');
  const [algorithm, setAlgorithm] = useState<'ed25519' | 'rsa'>('ed25519');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenerateKeyResult | null>(null);

  const providerLabel = PROVIDER_TEMPLATES.find((t) => t.id === provider)?.label ?? provider;
  const fileName = `${provider.replace(/[^a-z0-9]/g, '')}_${profileName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')}`.replace(/_+$/, '');

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api.generateKey({
        algorithm,
        fileName,
        comment: `${providerLabel.toLowerCase()}-${profileName.trim().toLowerCase()} (sshhub)`,
        passphrase,
      });
      setResult(res);
      setStep(2);
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Generate SSH Key" onClose={onClose}>
      <div className="steps">
        {[0, 1, 2].map((i) => <div key={i} className={`step-dot ${step >= i ? 'done' : ''}`} />)}
      </div>

      {step === 0 && (
        <>
          <div className="form-grid">
            <div className="field">
              <label>Provider</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                {PROVIDER_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Profile name</label>
              <input
                placeholder="e.g. Work"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                autoFocus
              />
              <span className="hint">Key file: ~/.ssh/{fileName || '…'}</span>
            </div>
          </div>
          <div className="actions">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={!profileName.trim()} onClick={() => setStep(1)}>Next</button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <div className="form-grid">
            <div className="field">
              <label>Algorithm</label>
              <select value={algorithm} onChange={(e) => setAlgorithm(e.target.value as 'ed25519' | 'rsa')}>
                <option value="ed25519">Ed25519 (recommended)</option>
                <option value="rsa">RSA 4096</option>
              </select>
            </div>
            <div className="field">
              <label>Passphrase (optional)</label>
              <input
                type="password"
                placeholder="Leave empty for none"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </div>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => setStep(0)}>Back</button>
            <button className="btn primary" disabled={busy} onClick={generate}>
              {busy ? 'Generating…' : 'Generate Key'}
            </button>
          </div>
        </>
      )}

      {step === 2 && result && (
        <>
          <p className="small" style={{ marginBottom: 10 }}>
            ✅ Key created at <span className="mono">{result.privateKeyPath}</span>.
            Add this public key to {providerLabel}:
          </p>
          <div className="pubkey-box">{result.publicKey}</div>
          <div className="actions">
            <button
              className="btn"
              onClick={async () => {
                await api.copyToClipboard(result.publicKey);
                toast('Public key copied to clipboard');
              }}
            >
              Copy public key
            </button>
            <button className="btn primary" onClick={onDone}>Done</button>
          </div>
        </>
      )}
    </Modal>
  );
}
