# Mail Toaster Project Status

## Project Scope
- Single-window macOS-first desktop shell for Gmail and Outlook Web.
- Local UI shell in Next.js, embedded remote mailbox views in Electron.
- Local-only persistence for inbox metadata, session partitions, unread state, and window preferences.

## Architecture Decision
- `BrowserWindow` hosts the local Next.js shell.
- Electron main process owns mailbox metadata, persistence, and mailbox lifecycle.
- Each inbox gets a persistent Electron partition: `persist:inbox-{id}`.
- Awake inboxes keep a live `WebContentsView` in memory for fast switching.
- Sleeping inboxes destroy their view and recreate it later against the same partition.

## Completed Tasks
- Chosen secure architecture for the MVP.
- Scaffolded the Electron + Next.js + Tailwind + shadcn-style UI shell.
- Implemented local JSON persistence for inbox metadata, selection, and window bounds.
- Implemented inbox CRUD, selection persistence, rename, and remove flows.
- Implemented per-inbox persistent partitions and secure embedded mailbox views.
- Implemented multi-open mailbox lifecycle with detached live views for fast switching.
- Implemented sleep/wake by destroying and recreating mailbox views against the same partition.
- Implemented best-effort unread parsing from provider page titles.
- Implemented macOS packaging pipeline and generated app icon assets.
- Fixed the packaged-app startup race so the main window always appears after launch.
- Switched the macOS icon pipeline to build the `.icns` directly from the uploaded app image without adding a frame.
- Added a dedicated top drag bar for better macOS window movement and a clearer traffic-light region.
- Added drag-to-sort inbox ordering in the left sidebar with persisted sort order.
- Reworked add, rename, and remove into inline left-rail panels so they stay above the mailbox layer.
- Added per-inbox custom icon upload and reset actions.
- Added a collapsible left sidebar that can reduce the list to icons only.
- Added browser-style mailbox controls above the embedded view: back, forward, refresh, home, and URL field.
- Tightened the app-wide corner radius scale and the embedded mailbox `WebContentsView` radius.
- Added an aggregate unread badge to the macOS Dock icon.
- Removed the custom header UI and left a native macOS drag region above the app content.
- Reduced container border contrast and fixed the add-panel provider selector persistence.
- Fixed the close-path crash caused by removing native child views after window teardown.
- Moved sidebar add/collapse controls into a compact footer and made the add action icon-only.
- Added best-effort provider account-avatar syncing so inbox rows can use the signed-in account image unless a custom icon overrides it.
- Added live animated drag-reorder previews so inboxes shift in real time while sorting.
- Added visible-display window restoration so saved bounds do not reopen off-screen.
- Added a single-instance app lock and background view throttling to avoid duplicate-process memory spikes.
- Added README and supporting architecture/security/behavior docs.

## Remaining Tasks
- Manual QA with real Gmail and Outlook sign-in flows.
- Optional future work such as notification controls and auto-sleep.

## Blockers
- None.

## Major Decisions
- Use a simple JSON file in Electron user data for MVP persistence instead of adding cloud or database complexity.
- Keep the renderer thin; the main process is the source of truth for mailbox state and view lifecycle.
- Serve the exported Next.js renderer over an internal `127.0.0.1` HTTP server in packaged builds so CSS and client bundles load correctly without a remote dependency.

## QA Checklist
- [x] App launches into the Mail Toaster shell in local dev.
- [ ] Gmail inbox can be added and logged in.
- [ ] Outlook inbox can be added and logged in.
- [ ] Sessions remain isolated per inbox and persist across restarts.
- [x] Switching between awake inboxes uses persistent live views.
- [x] Sleeping inboxes destroy runtime views and wake against the same partition.
- [x] Unread count or dot appears when detectable via title parsing.
- [x] Rename, remove, and last-selected inbox persistence are implemented.
- [x] Drag sorting, sidebar collapse, and custom inbox icons are implemented.
- [x] Browser-style mailbox controls are implemented above the embedded view.
- [x] `npm run build` succeeds.
- [x] `npm run pack:mac` succeeds.
- [x] `npm run dist:mac` succeeds.

## Performance Notes
- Awake inboxes favor switch speed over memory savings.
- Sleep mode trades instant resume for lower CPU and RAM use.
- Detached awake views remain alive in memory so unread/title updates can continue.
- The dedicated top drag bar keeps mailbox controls separate from the traffic-light area.
- The left-rail panel approach avoids renderer overlays being covered by native mailbox views.
- Live reorder previews stay in the renderer only until drop, then persist through the main-process sort update.
- Duplicate app launches are now collapsed into a single instance, and non-visible inbox renderers run with heavier throttling.

## Tradeoffs
- Sleep mode will preserve authentication state, but not transient DOM state inside the mailbox page.
- Unread detection is best-effort and title-driven for MVP robustness.
- The dev workflow uses a fixed local port so Electron and Next stay in sync.
- Drag sorting is implemented with native HTML drag events for simplicity instead of a heavier drag-and-drop framework.
- Drag sorting uses a small FLIP-style row animation so reordering feels live without bringing in a larger animation dependency.
- Custom inbox icons are stored locally as downscaled data URLs for simplicity.
- The packaged app still pays the memory cost of one Chromium renderer per awake inbox, because that is the tradeoff behind instant inbox switching.

## Known Limitations
- Exact unread counts depend on provider page title formats.
- External compose pop-outs and unsupported external links will open outside the app.
- macOS may cache old Dock icons until the rebuilt bundle is reopened or re-pinned.
