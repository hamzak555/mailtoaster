# Architecture

## Window Model
- One Electron `BrowserWindow` runs the local Next.js UI shell.
- The main content area is reserved for a provider `WebContentsView`.
- The renderer reports viewport bounds to Electron so the mailbox view can be positioned exactly inside the right-hand pane.
- In packaged builds, the exported `out/` bundle is served from an internal loopback HTTP server instead of `file://` so Next.js asset paths and client hydration work normally.

## Mailbox Lifecycle
- Inbox metadata lives in a local JSON store under Electron user data.
- Each inbox record stores its provider, partition, URL, sleep state, unread state, and ordering metadata.
- The Electron main process recreates awake inbox views on launch and restores the last selected inbox when possible.

## Session Isolation
- Each inbox gets a dedicated persistent partition in the form `persist:inbox-{id}`.
- Cookies, storage, and authentication state are isolated by partition, so multiple Gmail or Outlook accounts can stay logged in independently.
- Removing an inbox removes the Mail Toaster record and view, but its provider session remains in the partition until that partition data is cleared externally.

## Renderer Split
- The renderer is intentionally thin.
- UI actions go over IPC to the Electron main process.
- The main process owns the authoritative inbox list and emits state snapshots back to the renderer after every change.
