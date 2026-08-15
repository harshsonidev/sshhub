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

If `npm install` leaves `node_modules/electron/dist` without an `Electron.app`
(the download step was skipped or killed), run the fix in
[macOS dev gotchas](#macos-dev-gotchas-hit-during-bring-up) below.

## Build & install (macOS)

```bash
npm run build                          # compile main (tsc) + renderer (vite) into dist/
npx electron-builder --mac --arm64 --dir   # package → release/mac-arm64/SSHHub.app
                                           # (use --x64 on Intel; omit --dir for dmg+zip)

# No Developer ID certificate → electron-builder skips signing; sign ad-hoc yourself
# or macOS will refuse to start the app:
codesign --force --deep --sign - release/mac-arm64/SSHHub.app
codesign --verify --deep --strict release/mac-arm64/SSHHub.app   # must print nothing (valid)

# Install
cp -R release/mac-arm64/SSHHub.app /Applications/
```

**First launch must be done from Finder**: double-click SSHHub in
Applications. Because the app is ad-hoc signed (no Apple Developer ID),
Gatekeeper blocks the first attempt — approve it via right-click → Open, or
System Settings → Privacy & Security → "Open Anyway", one time only.
Launching via `open` from a terminal is refused silently, so don't test with
that. The permanent fix is signing with a real Developer ID certificate
(`CSC_LINK`/`CSC_KEY_PASSWORD` env vars for electron-builder) and notarizing.

## Build & install (Windows)

```powershell
npm install
npm run build
npx electron-builder --win --x64      # → release/SSHHub Setup 0.1.0.exe (NSIS installer)
```

Run the generated installer; it creates Start-menu and desktop shortcuts and
installs per-user (no admin needed). SmartScreen will warn on first run
because the installer is unsigned — choose "More info → Run anyway", or sign
with an Authenticode certificate for a clean install experience.

Notes for Windows:

- Requires Git for Windows and OpenSSH (built into Windows 10/11:
  `ssh`, `ssh-keygen`, `ssh-add` must be on PATH).
- The ssh-agent service is disabled by default; enable it once in PowerShell
  (admin): `Set-Service ssh-agent -StartupType Automatic; Start-Service ssh-agent`.
- App data lives in `%APPDATA%/SSHHub`; keys stay in `%USERPROFILE%\.ssh`.
- Cross-building the Windows installer from macOS works for NSIS targets
  (`npx electron-builder --win --x64` on the Mac); building on a real Windows
  machine is the better-tested path.

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
  ad-hoc signature, which newer macOS XProtect quarantines as malware
  (it stalls in `_dyld_start`, then gets moved to Trash). Fix — re-extract
  the cached zip preserving the bundle exactly, then give it a complete
  ad-hoc signature:

  ```bash
  # <hash> = the one directory inside ~/Library/Caches/electron
  ditto -xk ~/Library/Caches/electron/<hash>/electron-v*-darwin-arm64.zip \
        node_modules/electron/dist
  codesign --force --deep --sign - node_modules/electron/dist/Electron.app
  codesign --verify --deep --strict node_modules/electron/dist/Electron.app
  ```

  If `node_modules/electron/dist` is missing entirely, download it first with
  `node node_modules/electron/install.js`, then run the commands above.
- **Electron starts in plain-Node mode ("bad option" errors)**: shells spawned
  by VSCode/Claude Code export `ELECTRON_RUN_AS_NODE=1`; unset it before
  launching (`env -u ELECTRON_RUN_AS_NODE npx electron .` —
  `scripts/smoke.mjs` does this automatically).
- **Packaged app won't open via `open` / Gatekeeper "rejected"**: ad-hoc
  signed apps are refused silently when launched from a terminal
  (`spctl --assess --type execute /Applications/SSHHub.app` prints
  "rejected"). Approve once from Finder (right-click → Open / "Open Anyway"
  in System Settings → Privacy & Security); after that it opens normally.
