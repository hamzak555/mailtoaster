# Security Notes

## Embedded Mailbox Isolation
- Remote mailbox views run in dedicated `WebContentsView` instances.
- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`

## URL Restrictions
- Gmail inboxes are restricted to Gmail and Google account hosts required for login redirects.
- Outlook inboxes are restricted to Outlook and Microsoft account hosts required for login redirects.
- Unsupported top-level navigations are blocked and opened in the default browser instead.
- `window.open` requests are denied and opened externally.

## Permissions
- Per-partition permission checks and requests are denied by default.
- Remote pages never get direct Node.js access or Electron APIs.

## Local Surface Area
- The preload script only exposes the narrow IPC API needed by the local renderer shell.
- The packaged renderer is served only from an internal `127.0.0.1` listener created by the app at launch.
- Inbox metadata is stored locally; credentials are never persisted manually by the app.
