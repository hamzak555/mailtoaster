# Mail Toaster

Mail Toaster is a minimal macOS desktop shell for running multiple Gmail and Outlook inboxes inside one Electron window. The UI is local; the actual mailbox experiences stay inside isolated Electron web contents with persistent per-inbox sessions.

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

Create signed DMG/ZIP artifacts:

```bash
npm run dist:mac
```

## Install On macOS
1. Build the packaged app with `npm run pack:mac` or the distributable DMG/ZIP with `npm run dist:mac`.
2. Open [release/Mail-Toaster-0.1.0-arm64.dmg](release/Mail-Toaster-0.1.0-arm64.dmg) or copy [release/mac-arm64/Mail Toaster.app](release/mac-arm64/Mail%20Toaster.app) into `/Applications`.
3. Launch `Mail Toaster.app` from `/Applications` or Launchpad.

The packaged app does not need `npm run dev` or a Next.js server. The built app serves its local renderer internally.

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
