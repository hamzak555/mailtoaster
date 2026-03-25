# Mail Toaster

Mail Toaster is a minimal desktop shell for running multiple Gmail, Outlook, Protonmail, and WhatsApp inboxes inside one Electron window. The UI is local; the actual mailbox experiences stay inside isolated Electron web contents with persistent per-inbox sessions.

## Stack
- Electron
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-style component setup

## Local Run
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## macOS Package
```bash
npm run pack:mac
```

Create distributable release artifacts:

```bash
npm run dist:mac
```

## Windows Package
```bash
npm run pack:win
```

Create distributable release artifacts:

```bash
npm run dist:win
```

## Install From GitHub Releases
1. Open the [latest release](https://github.com/hamzak555/mailtoaster/releases/latest).
2. On macOS, download the DMG asset named `Mail-Toaster-<version>-arm64.dmg`.
3. On Windows, download the NSIS installer named `Mail-Toaster-<version>-x64.exe`.
4. Install the app for your platform and launch `Mail Toaster`.
5. On macOS, keep the app in `/Applications` if you want in-app auto-updates to install correctly.

The packaged app does not need `npm run dev` or a Next.js server. The built app serves its local renderer internally.

## If macOS Blocks The App
If macOS shows `Apple could not verify "Mail Toaster" is free of malware`, the release has not been notarized yet.

Temporary workaround:
1. Move the app into `/Applications`.
2. Control-click `Mail Toaster.app` and choose `Open`.
3. Click `Open` again in the system prompt.

You can also go to `System Settings > Privacy & Security` and use `Open Anyway` after the first launch attempt.

Without Developer ID signing and Apple notarization, this warning will continue to appear on other Macs. There is no packaging-only workaround for that.

## Release Assets
- `Mail-Toaster-<version>-arm64.dmg`: the file most users should download for first install.
- `Mail-Toaster-<version>-arm64.zip`: required for macOS auto-update delivery.
- `Mail-Toaster-<version>-x64.exe`: Windows installer.
- `latest.yml`: required metadata for the Windows updater.
- `latest-mac.yml`: required metadata for the updater.

The GitHub auto-generated `Source code (zip)` asset is not the same as the app ZIP used by Electron auto-updates.

## Environment Variables
- None required.
- `MAIL_TOASTER_RENDERER_URL` is used internally by the dev script.

## Architecture Summary
- One Electron `BrowserWindow` hosts the local Next.js shell.
- Each inbox gets its own persistent Electron partition: `persist:inbox-{id}`.
- Awake inboxes keep live `WebContentsView` instances in memory for fast switching.
- Sleeping inboxes destroy their `WebContentsView` and recreate it later against the same partition.
- The Electron main process is the source of truth for inbox metadata, unread state, selection, and embedded view lifecycle.

## Notes
- Session isolation: [docs/architecture.md](docs/architecture.md)
- Security notes: [docs/security.md](docs/security.md)
- Lifecycle, sleep/wake, and unread detection: [docs/mailbox-behavior.md](docs/mailbox-behavior.md)
- Implementation status: [PROJECT_STATUS.md](PROJECT_STATUS.md)

## Known Limitations
- Unread detection is best-effort and depends on provider page titles.
- Sleep mode preserves authentication state, not transient page DOM state.
- Unsupported pop-out windows and external links open outside the app.
