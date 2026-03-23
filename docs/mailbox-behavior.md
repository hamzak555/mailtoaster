# Mailbox Behavior

## Multi-Open Views
- Awake inboxes keep live `WebContentsView` instances in memory even when they are not attached to the visible pane.
- Switching between awake inboxes reattaches the selected view instead of rebuilding the provider page.
- This favors fast switching over lower memory usage.
- Background inbox renderers are throttled more aggressively than the visible inbox to reduce idle CPU and GPU work.

## Sleep and Wake
- Sleeping an inbox destroys its `WebContentsView` while keeping the persistent partition intact.
- Waking recreates the view and reloads the provider inbox using the same partition.
- This reduces runtime CPU and RAM use while preserving login state.

## Unread Detection
- Unread state is derived from page title updates.
- Exact counts are shown when title parsing finds a numeric unread marker.
- If a provider exposes a weaker unread signal, the UI can fall back to a dot.
- The last known unread state is persisted locally.

## Tradeoffs
- Sleep mode does not preserve transient DOM state such as scroll position or draft UI state.
- Title-based unread parsing is deliberately defensive; if parsing fails, the app keeps working and unread state simply degrades.
- Every awake inbox is still its own Chromium renderer process, so memory use scales with the number of inboxes you keep awake.
