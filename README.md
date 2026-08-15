# SSHHub

Cross-platform local SSH profile manager — a visual way to manage multiple SSH
identities (GitHub work/personal, GitLab, Bitbucket, AWS, servers) without ever
hand-editing `~/.ssh/config`.

Local-only by design: no cloud account, no backend, no telemetry, no database.
State is one JSON file in the per-user app data directory
(`~/Library/Application Support/SSHHub` on macOS, `%APPDATA%/SSHHub` on
Windows). Private keys stay in `~/.ssh` and are only referenced, never copied
or uploaded.

## Features

- **SSH Key Dashboard** — auto-discovers keys in `~/.ssh` (name, algorithm,
  fingerprint, created date, which profile uses it, agent status) plus
  duplicate-fingerprint detection.
- **Key Generator** — 3-step wizard (provider → name → done), Ed25519 or
  RSA 4096 via native `ssh-keygen`, shows the public key ready to paste.
- **Profiles** — provider templates (GitHub, GitLab, Bitbucket, AWS EC2,
  Azure VM, DigitalOcean, generic). Saving a profile writes a managed
  `Host` block to `~/.ssh/config` (marked with `# sshhub:profile=<id>`);
  unmanaged entries are preserved byte-for-byte.
- **Connection Tester** — `ssh -T` per profile with banner-aware success
  detection (GitHub/GitLab/Bitbucket exit non-zero on success).
- **SSH Config viewer** — visual table of all Host entries + raw file view.
- **Repository Scanner** — point it at a code folder; it maps each git
  remote to the profile it resolves to, and converts remotes
  (`https://github.com/org/repo.git` → `git@github-work:org/repo.git`)
  with one click.
- **Agent Manager** — view `ssh-add -l`, add/remove/reload keys,
  load-at-startup checklist (uses macOS Keychain via
  `--apple-use-keychain` when available).
- **AWS** — lists profiles from `~/.aws/config` / `~/.aws/credentials`
  (section names only, credentials never read) and maps each to an SSH key.
- **Backups** — automatic snapshot of `~/.ssh/config` before every change;
  one-click restore (which itself snapshots first).

## Stack

Electron 31 + React 18 + TypeScript. Renderer bundled with Vite; main and
preload compiled with tsc. No runtime npm dependencies — SSH operations shell
out to native `ssh`, `ssh-keygen`, `ssh-add`, `git` (no shell interpolation;
args are passed as arrays). Renderer runs sandboxed with contextIsolation; all
privileged work goes through a typed IPC bridge in `preload/`.

## Develop

```bash
npm install
npm run dev        # vite dev server + electron with live renderer
npm start          # build everything, launch the app
npm run typecheck
```

## Package

```bash
npm run dist       # electron-builder → release/ (macOS dmg/zip x64+arm64, Windows NSIS)
```

## Smoke test

```bash
node scripts/smoke.mjs   # launches the app, visits every page, screenshots to smoke-shots/
```

## Layout

```
main/           Electron main process (Node)
  store.ts        JSON persistence (profiles + settings)
  ssh/keys.ts     key discovery, ssh-keygen wrapper, duplicate detection
  ssh/config.ts   line-preserving ~/.ssh/config parser/writer + backups
  ssh/agent.ts    ssh-add wrapper
  ssh/test.ts     connection tester
  git/scanner.ts  repo discovery, remote URL conversion
  aws/profiles.ts ~/.aws INI section reader
preload/        contextBridge IPC (window.sshhub)
renderer/       React app (Vite)
shared/types.ts shared TypeScript types + provider templates
```

## macOS dev gotchas (hit during bring-up)

- **"Electron.app contains malware" / launch hangs in dyld**: the Electron
  binary that `npm install` extracts can end up with a broken/linker-only
  ad-hoc signature, which newer macOS XProtect quarantines as malware. Fix:
  re-extract the cached zip with `ditto -xk` and then
  `codesign --force --deep --sign - node_modules/electron/dist/Electron.app`.
- **Electron starts in plain-Node mode ("bad option" errors)**: shells spawned
  by VSCode/Claude Code export `ELECTRON_RUN_AS_NODE=1`; unset it before
  launching (`scripts/smoke.mjs` does this automatically).
