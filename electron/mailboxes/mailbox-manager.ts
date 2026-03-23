import { app, BrowserWindow, Notification as ElectronNotification, type Rectangle, shell, type WebContents, WebContentsView } from 'electron';

import {
  getAggregateUnreadCount,
  getDefaultDisplayName,
  getProviderLabel,
  compareMailboxes,
  hasAggregateUnreadDot,
  type MailboxUnreadState,
  type MailboxProvider,
  type MailboxRecord,
} from '@shared/mailboxes';
import type { CreateMailboxInput, MailboxViewState, MailToasterState, MailboxViewport } from '@shared/ipc';

import { APP_NAME } from '@shared/mailboxes';

import { AppStore } from '../persistence/app-store';
import { getDefaultTargetUrl, isAllowedAvatarAssetUrl, isAllowedMailboxUrl } from './provider-config';
import { parseUnreadFromTitle } from './unread';

const MAILBOX_VIEW_BORDER_RADIUS = 16;

interface MailboxUnreadSnapshot {
  unreadState: MailboxUnreadState;
  unreadCount: number | null;
}

interface MailboxUnreadPreview {
  sender: string | null;
  subject: string | null;
  preview: string | null;
  rowKey: string | null;
  secondaryRowKey: string | null;
  actionUrl: string | null;
}

function hasUnread({ unreadState, unreadCount }: MailboxUnreadSnapshot): boolean {
  if (unreadState === 'dot') {
    return true;
  }

  return unreadState === 'count' && Boolean(unreadCount && unreadCount > 0);
}

function shouldNotifyForUnreadChange(previous: MailboxUnreadSnapshot, next: MailboxUnreadSnapshot): boolean {
  if (!hasUnread(next)) {
    return false;
  }

  if (!hasUnread(previous)) {
    return true;
  }

  if (previous.unreadState === 'count' && next.unreadState === 'count') {
    return (next.unreadCount ?? 0) > (previous.unreadCount ?? 0);
  }

  return false;
}

function getUnreadNotificationBody(previous: MailboxUnreadSnapshot, next: MailboxUnreadSnapshot): string {
  if (next.unreadState !== 'count' || !next.unreadCount || next.unreadCount <= 0) {
    return 'New unread mail.';
  }

  if (!hasUnread(previous)) {
    return next.unreadCount === 1 ? '1 unread message.' : `${next.unreadCount} unread messages.`;
  }

  const previousCount = previous.unreadState === 'count' ? previous.unreadCount ?? 0 : 0;
  const delta = Math.max(1, next.unreadCount - previousCount);

  return delta === 1
    ? `1 new unread message (${next.unreadCount} total).`
    : `${delta} new unread messages (${next.unreadCount} total).`;
}

function truncateText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.replace(/\s+/g, ' ').trim();

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function getUnreadNotificationSubtitle(provider: MailboxProvider, preview: MailboxUnreadPreview | null): string {
  return truncateText(preview?.sender, 80) ?? getProviderLabel(provider);
}

function getUnreadNotificationBodyWithPreview(
  previous: MailboxUnreadSnapshot,
  next: MailboxUnreadSnapshot,
  preview: MailboxUnreadPreview | null,
): string {
  const subject = truncateText(preview?.subject, 120);
  const messagePreview = truncateText(preview?.preview, 180);
  const bodyWithPreview = [subject, messagePreview].filter((value): value is string => Boolean(value)).join(' — ');

  return bodyWithPreview || getUnreadNotificationBody(previous, next);
}

function isLikelyThreadView(provider: MailboxProvider, candidateUrl: string): boolean {
  try {
    const { hash, pathname } = new URL(candidateUrl);

    if (provider === 'gmail') {
      const hashSegments = hash
        .replace(/^#/, '')
        .split('/')
        .filter(Boolean);

      if (hashSegments.length <= 1) {
        return false;
      }

      if (hashSegments[0] === 'label' || hashSegments[0] === 'category') {
        return hashSegments.length > 2;
      }

      return !['search', 'settings', 'advanced-search'].includes(hashSegments[0] ?? '');
    }

    return pathname.includes('/mail/id/') || pathname.includes('/mail/deeplink/read/');
  } catch {
    return false;
  }
}

function shouldRetainUnreadState(
  provider: MailboxProvider,
  currentUrl: string,
  previousUnreadState: MailboxUnreadSnapshot,
  parsedUnreadState: MailboxUnreadSnapshot,
): boolean {
  return hasUnread(previousUnreadState) && !hasUnread(parsedUnreadState) && isLikelyThreadView(provider, currentUrl);
}

function getUnreadPreviewDomConfig(provider: MailboxProvider) {
  return provider === 'gmail'
    ? {
        rowSelectors: ['tr.zA.zE', 'tr.zE', 'tr.zA', 'tr[aria-label*="unread"]', 'tr[role="row"]'],
        senderSelectors: ['.yP', '.yW span[email]', '.yW span', '.yW'],
        subjectSelectors: ['.bog span', '.bog'],
        previewSelectors: ['.y2', '.y6 .y2'],
        linkSelectors: ['a[href*="#"]', 'a[href*="/mail/"]'],
        keyAttributes: ['data-legacy-message-id', 'data-message-id', 'data-legacy-thread-id', 'data-thread-id'],
        secondaryKeyAttributes: ['data-legacy-thread-id', 'data-thread-id'],
      }
    : {
        rowSelectors: [
          'div[role="option"][aria-label*="Unread"]',
          'div[role="row"][aria-label*="Unread"]',
          'div[data-isunread="true"]',
          '[data-convid][aria-label*="Unread"]',
          'div[role="option"]',
          'div[role="row"]',
          '[data-convid]',
        ],
        senderSelectors: [
          '[data-automationid="Sender"]',
          '[data-automationid="From"]',
          '[title][data-automationid*="Sender"]',
        ],
        subjectSelectors: [
          '[data-automationid="Subject"]',
          '[data-automationid="MessageSubject"]',
          '[title][data-automationid*="Subject"]',
        ],
        previewSelectors: [
          '[data-automationid="SnippetPreview"]',
          '[data-automationid="PreviewText"]',
          '[data-automationid*="Preview"]',
        ],
        linkSelectors: ['a[href*="/mail/"]', 'a[href*="outlook"]', 'a[href*="office.com"]'],
        keyAttributes: ['data-itemid', 'data-item-key', 'data-convid'],
        secondaryKeyAttributes: ['data-convid'],
      };
}

export class MailboxManager {
  private readonly configuredPartitions = new Set<string>();
  private readonly views = new Map<string, WebContentsView>();
  private readonly viewStates = new Map<string, MailboxViewState>();
  private readonly avatarSourceUrls = new Map<string, string>();
  private readonly activeNotifications = new Set<ElectronNotification>();
  private readonly primedUnreadInboxIds = new Set<string>();
  private inboxes: MailboxRecord[];
  private selectedInboxId: string | null;
  private attachedInboxId: string | null = null;
  private viewport: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

  constructor(
    private readonly window: BrowserWindow,
    private readonly store: AppStore,
  ) {
    const state = this.store.getState();

    this.inboxes = [...state.inboxes].sort(compareMailboxes);
    this.selectedInboxId = this.resolveSelectedInbox(state.selectedInboxId);

    for (const inbox of this.inboxes) {
      this.viewStates.set(inbox.id, {
        canGoBack: false,
        canGoForward: false,
        currentUrl: inbox.targetUrl,
        isLoading: false,
      });
    }
  }

  initialize(): void {
    const selectedInbox = this.getSelectedInbox();

    if (selectedInbox?.sleepState === 'awake') {
      this.ensureView(selectedInbox.id);
    }

    for (const inbox of this.inboxes) {
      if (inbox.sleepState === 'awake' && inbox.id !== selectedInbox?.id) {
        this.ensureView(inbox.id);
      }
    }

    this.persistState();
    this.emitState();
  }

  dispose(): void {
    this.detachCurrentView();

    for (const inboxId of [...this.views.keys()]) {
      this.destroyView(inboxId);
    }
  }

  getState(): MailToasterState {
    return {
      inboxes: [...this.inboxes].sort(compareMailboxes),
      selectedInboxId: this.selectedInboxId,
      viewStates: Object.fromEntries(this.viewStates.entries()),
    };
  }

  async createInbox(input: CreateMailboxInput): Promise<void> {
    const trimmedName = input.displayName?.trim();
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const sameProviderCount = this.inboxes.filter((inbox) => inbox.provider === input.provider).length;
    const displayName = trimmedName && trimmedName.length > 0 ? trimmedName : getDefaultDisplayName(input.provider, sameProviderCount);
    const sortOrder = this.inboxes.length === 0 ? 0 : Math.max(...this.inboxes.map((inbox) => inbox.sortOrder)) + 1;

    const mailbox: MailboxRecord = {
      id,
      provider: input.provider,
      displayName,
      targetUrl: getDefaultTargetUrl(input.provider),
      icon: input.provider,
      accountAvatarDataUrl: null,
      customIconDataUrl: null,
      partition: `persist:inbox-${id}`,
      sleepState: 'awake',
      unreadCount: null,
      unreadState: 'none',
      sortOrder,
      createdAt,
      updatedAt: createdAt,
    };

    this.inboxes = [...this.inboxes, mailbox].sort(compareMailboxes);
    this.viewStates.set(mailbox.id, {
      canGoBack: false,
      canGoForward: false,
      currentUrl: mailbox.targetUrl,
      isLoading: true,
    });
    this.selectedInboxId = mailbox.id;
    this.ensureView(mailbox.id);
    this.persistState();
    this.attachSelectedView();
    this.emitState();
  }

  async renameInbox(id: string, displayName: string): Promise<void> {
    const trimmedName = displayName.trim();

    if (!trimmedName) {
      throw new Error('Display name is required.');
    }

    this.updateInbox(id, (mailbox) => ({
      ...mailbox,
      displayName: trimmedName,
      updatedAt: new Date().toISOString(),
    }));

    this.persistState();
    this.emitState();
  }

  async setInboxCustomIcon(id: string, customIconDataUrl: string): Promise<void> {
    if (!customIconDataUrl.startsWith('data:image/')) {
      throw new Error('Unsupported image format.');
    }

    this.updateInbox(id, (mailbox) => ({
      ...mailbox,
      customIconDataUrl,
      updatedAt: new Date().toISOString(),
    }));

    this.persistState();
    this.emitState();
  }

  async clearInboxCustomIcon(id: string): Promise<void> {
    this.updateInbox(id, (mailbox) => ({
      ...mailbox,
      customIconDataUrl: null,
      updatedAt: new Date().toISOString(),
    }));

    this.persistState();
    this.emitState();
  }

  async reorderInboxes(orderedInboxIds: string[]): Promise<void> {
    const nextInboxIds = [...new Set(orderedInboxIds)];

    if (nextInboxIds.length !== this.inboxes.length) {
      return;
    }

    const inboxById = new Map(this.inboxes.map((inbox) => [inbox.id, inbox]));

    if (nextInboxIds.some((inboxId) => !inboxById.has(inboxId))) {
      return;
    }

    const currentOrderKey = this.inboxes.map((inbox) => inbox.id).join('|');
    const nextOrderKey = nextInboxIds.join('|');

    if (currentOrderKey === nextOrderKey) {
      return;
    }

    const reorderedAt = new Date().toISOString();

    this.inboxes = nextInboxIds.map((inboxId, index) => {
      const inbox = inboxById.get(inboxId)!;
      const sortChanged = inbox.sortOrder !== index;

      return {
        ...inbox,
        sortOrder: index,
        updatedAt: sortChanged ? reorderedAt : inbox.updatedAt,
      };
    });

    this.persistState();
    this.emitState();
  }

  async removeInbox(id: string): Promise<void> {
    const mailbox = this.findInbox(id);

    if (!mailbox) {
      return;
    }

    const remainingInboxes = this.inboxes.filter((inbox) => inbox.id !== id);
    this.destroyView(id);
    this.avatarSourceUrls.delete(id);
    this.viewStates.delete(id);
    this.inboxes = remainingInboxes
      .sort(compareMailboxes)
      .map((inbox, index) => ({
        ...inbox,
        sortOrder: index,
      }));

    if (this.selectedInboxId === id) {
      this.selectedInboxId = this.inboxes[0]?.id ?? null;
    }

    this.persistState();
    this.attachSelectedView();
    this.emitState();
  }

  async selectInbox(id: string): Promise<void> {
    const mailbox = this.findInbox(id);

    if (!mailbox) {
      return;
    }

    this.selectedInboxId = id;

    if (mailbox.sleepState === 'awake') {
      this.ensureView(id);
    }

    this.persistState();
    this.attachSelectedView();
    this.emitState();
  }

  async sleepInbox(id: string): Promise<void> {
    const mailbox = this.findInbox(id);

    if (!mailbox || mailbox.sleepState === 'sleeping') {
      return;
    }

    this.updateInbox(id, (currentMailbox) => ({
      ...currentMailbox,
      sleepState: 'sleeping',
      updatedAt: new Date().toISOString(),
    }));

    this.destroyView(id);
    this.persistState();
    this.attachSelectedView();
    this.emitState();
  }

  async wakeInbox(id: string): Promise<void> {
    const mailbox = this.findInbox(id);

    if (!mailbox || mailbox.sleepState === 'awake') {
      return;
    }

    this.updateInbox(id, (currentMailbox) => ({
      ...currentMailbox,
      sleepState: 'awake',
      updatedAt: new Date().toISOString(),
    }));

    this.ensureView(id);
    this.persistState();
    this.attachSelectedView();
    this.emitState();
  }

  async openInboxExternal(id: string): Promise<void> {
    const mailbox = this.findInbox(id);

    if (mailbox) {
      await shell.openExternal(this.viewStates.get(id)?.currentUrl ?? mailbox.targetUrl);
    }
  }

  async goBackInbox(id: string): Promise<void> {
    const view = this.getActiveView(id);

    if (view?.webContents.canGoBack()) {
      view.webContents.goBack();
    }
  }

  async goForwardInbox(id: string): Promise<void> {
    const view = this.getActiveView(id);

    if (view?.webContents.canGoForward()) {
      view.webContents.goForward();
    }
  }

  async reloadInbox(id: string): Promise<void> {
    const mailbox = this.findInbox(id);

    if (!mailbox) {
      return;
    }

    if (mailbox.sleepState === 'sleeping') {
      await this.wakeInbox(id);
      return;
    }

    const view = this.getActiveView(id);

    if (view) {
      view.webContents.reload();
    }
  }

  async goHomeInbox(id: string): Promise<void> {
    const mailbox = this.findInbox(id);

    if (mailbox) {
      await this.navigateInbox(id, mailbox.targetUrl);
    }
  }

  async navigateInbox(id: string, candidateUrl: string): Promise<void> {
    const mailbox = this.findInbox(id);

    if (!mailbox) {
      return;
    }

    const nextUrl = this.normalizeMailboxUrl(mailbox.provider, candidateUrl);

    if (mailbox.sleepState === 'sleeping') {
      await this.wakeInbox(id);
    }

    const view = this.ensureView(id);

    if (!view) {
      return;
    }

    this.syncViewState(id, {
      canGoBack: view.webContents.canGoBack(),
      canGoForward: view.webContents.canGoForward(),
      currentUrl: nextUrl,
      isLoading: true,
    });

    await view.webContents.loadURL(nextUrl);
    this.syncViewStateFromWebContents(id, view.webContents);
    this.attachSelectedView();
  }

  async setViewport(viewport: MailboxViewport): Promise<void> {
    this.viewport = {
      x: Math.round(viewport.x),
      y: Math.round(viewport.y),
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
    };

    this.attachSelectedView();
  }

  private resolveSelectedInbox(candidateId: string | null): string | null {
    if (candidateId && this.inboxes.some((inbox) => inbox.id === candidateId)) {
      return candidateId;
    }

    return this.inboxes[0]?.id ?? null;
  }

  private getSelectedInbox(): MailboxRecord | undefined {
    return this.selectedInboxId ? this.findInbox(this.selectedInboxId) : undefined;
  }

  private findInbox(id: string): MailboxRecord | undefined {
    return this.inboxes.find((inbox) => inbox.id === id);
  }

  private getActiveView(id: string): WebContentsView | undefined {
    const mailbox = this.findInbox(id);

    if (!mailbox || mailbox.sleepState === 'sleeping') {
      return undefined;
    }

    return this.ensureView(id);
  }

  private updateInbox(id: string, updater: (mailbox: MailboxRecord) => MailboxRecord): void {
    this.inboxes = this.inboxes
      .map((mailbox) => (mailbox.id === id ? updater(mailbox) : mailbox))
      .sort(compareMailboxes);
  }

  private persistState(): void {
    this.store.saveMailboxState(this.inboxes, this.selectedInboxId);
  }

  private emitState(): void {
    this.syncDockBadge();

    if (this.window.isDestroyed()) {
      return;
    }

    this.window.setTitle(APP_NAME);
    this.window.webContents.send('mail-toaster:state-changed', this.getState());
  }

  private syncDockBadge(): void {
    if (process.platform !== 'darwin' || !app.dock) {
      return;
    }

    const totalUnreadCount = getAggregateUnreadCount(this.inboxes);
    const hasUnreadDot = hasAggregateUnreadDot(this.inboxes);
    const badgeText = totalUnreadCount > 0 ? `${totalUnreadCount}${hasUnreadDot ? '+' : ''}` : hasUnreadDot ? '•' : '';

    app.dock.setBadge(badgeText);
  }

  private attachSelectedView(): void {
    const selectedInbox = this.getSelectedInbox();

    if (!selectedInbox || selectedInbox.sleepState === 'sleeping' || this.viewport.width <= 0 || this.viewport.height <= 0) {
      this.detachCurrentView();
      return;
    }

    const view = this.ensureView(selectedInbox.id);

    if (!view) {
      return;
    }

    if (this.attachedInboxId && this.attachedInboxId !== selectedInbox.id) {
      this.detachCurrentView();
    }

    view.setBounds(this.viewport);
    view.setBorderRadius(MAILBOX_VIEW_BORDER_RADIUS);

    if (this.attachedInboxId !== selectedInbox.id) {
      this.window.contentView.addChildView(view);
      this.attachedInboxId = selectedInbox.id;
    }

    this.syncViewPerformanceModes();
  }

  private detachCurrentView(): void {
    if (!this.attachedInboxId) {
      return;
    }

    if (this.window.isDestroyed()) {
      this.attachedInboxId = null;
      return;
    }

    const view = this.views.get(this.attachedInboxId);

    if (view) {
      try {
        this.window.contentView.removeChildView(view);
      } catch {
        // The native window can already be tearing down during close.
      }
    }

    this.attachedInboxId = null;
    this.syncViewPerformanceModes();
  }

  private ensureView(id: string): WebContentsView | undefined {
    const existingView = this.views.get(id);

    if (existingView) {
      return existingView;
    }

    const mailbox = this.findInbox(id);

    if (!mailbox || mailbox.sleepState === 'sleeping') {
      return undefined;
    }

    const view = new WebContentsView({
      webPreferences: {
        partition: mailbox.partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        spellcheck: true,
      },
    });

    view.setBorderRadius(MAILBOX_VIEW_BORDER_RADIUS);
    this.configureView(view, mailbox.id, mailbox.provider);
    this.views.set(mailbox.id, view);
    this.syncViewState(mailbox.id, {
      canGoBack: false,
      canGoForward: false,
      currentUrl: mailbox.targetUrl,
      isLoading: true,
    });
    this.syncViewPerformanceModes();
    void view.webContents.loadURL(mailbox.targetUrl);

    return view;
  }

  private configureView(view: WebContentsView, mailboxId: string, provider: MailboxProvider): void {
    const { webContents } = view;

    this.configurePartition(webContents, mailboxId);

    webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: 'deny' };
    });

    webContents.on('will-navigate', (event, url) => {
      if (!isAllowedMailboxUrl(provider, url)) {
        event.preventDefault();
        void shell.openExternal(url);
      }
    });

    webContents.on('page-title-updated', (event, title) => {
      event.preventDefault();
      this.applyUnreadState(mailboxId, provider, title);
      this.window.setTitle(APP_NAME);
    });

    webContents.on('did-start-loading', () => {
      this.syncViewStateFromWebContents(mailboxId, webContents);
    });

    webContents.on('did-stop-loading', () => {
      this.syncViewStateFromWebContents(mailboxId, webContents);
      void this.syncAccountAvatar(mailboxId, provider, webContents);
    });

    webContents.on('did-navigate', () => {
      this.syncViewStateFromWebContents(mailboxId, webContents);
    });

    webContents.on('did-navigate-in-page', () => {
      this.syncViewStateFromWebContents(mailboxId, webContents);
    });

    webContents.on('did-fail-load', () => {
      this.syncViewStateFromWebContents(mailboxId, webContents);
    });

    webContents.on('did-finish-load', () => {
      this.syncViewStateFromWebContents(mailboxId, webContents);
      void this.syncAccountAvatar(mailboxId, provider, webContents);
      setTimeout(() => {
        void this.syncAccountAvatar(mailboxId, provider, webContents);
      }, 1200);
      if (this.selectedInboxId === mailboxId) {
        this.attachSelectedView();
      }
    });

    webContents.on('render-process-gone', () => {
      this.destroyView(mailboxId);

      const mailbox = this.findInbox(mailboxId);

      if (mailbox?.sleepState === 'awake') {
        this.ensureView(mailboxId);
        this.attachSelectedView();
      }
    });
  }

  private configurePartition(webContents: WebContents, mailboxId: string): void {
    const { session } = webContents;
    const mailbox = this.findInbox(mailboxId);

    if (!mailbox || this.configuredPartitions.has(mailbox.partition)) {
      return;
    }

    session.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false);
    });

    session.setPermissionCheckHandler(() => false);
    this.configuredPartitions.add(mailbox.partition);
  }

  private syncViewPerformanceModes(): void {
    for (const [mailboxId, view] of this.views.entries()) {
      const isForegroundView = this.attachedInboxId === mailboxId;

      if (view.webContents.isDestroyed()) {
        continue;
      }

      view.webContents.setBackgroundThrottling(!isForegroundView);
      view.webContents.setFrameRate(isForegroundView ? 60 : 5);
    }
  }

  private applyUnreadState(mailboxId: string, provider: MailboxProvider, title: string): void {
    const mailbox = this.findInbox(mailboxId);

    if (!mailbox) {
      return;
    }

    const previousUnreadState: MailboxUnreadSnapshot = {
      unreadState: mailbox.unreadState,
      unreadCount: mailbox.unreadCount,
    };
    const currentUrl = this.viewStates.get(mailboxId)?.currentUrl ?? mailbox.targetUrl;
    const parsedUnreadState = parseUnreadFromTitle(provider, title);
    const nextUnreadState = shouldRetainUnreadState(provider, currentUrl, previousUnreadState, parsedUnreadState)
      ? previousUnreadState
      : parsedUnreadState;
    const isUnreadPrimed = this.primedUnreadInboxIds.has(mailboxId);

    if (!isUnreadPrimed) {
      this.primedUnreadInboxIds.add(mailboxId);
    }

    if (
      previousUnreadState.unreadState === nextUnreadState.unreadState &&
      previousUnreadState.unreadCount === nextUnreadState.unreadCount
    ) {
      return;
    }

    const shouldNotify =
      isUnreadPrimed &&
      shouldNotifyForUnreadChange(previousUnreadState, nextUnreadState) &&
      !this.shouldSuppressUnreadNotification(mailboxId);

    this.updateInbox(mailboxId, (currentMailbox) => ({
      ...currentMailbox,
      unreadState: nextUnreadState.unreadState,
      unreadCount: nextUnreadState.unreadCount,
      updatedAt: new Date().toISOString(),
    }));

    this.persistState();
    this.emitState();

    if (shouldNotify) {
      void this.showUnreadNotification(mailbox, previousUnreadState, nextUnreadState);
    }
  }

  private syncViewState(mailboxId: string, nextState: MailboxViewState): void {
    const currentState = this.viewStates.get(mailboxId);

    if (
      currentState &&
      currentState.canGoBack === nextState.canGoBack &&
      currentState.canGoForward === nextState.canGoForward &&
      currentState.currentUrl === nextState.currentUrl &&
      currentState.isLoading === nextState.isLoading
    ) {
      return;
    }

    this.viewStates.set(mailboxId, nextState);
    this.emitState();
  }

  private syncViewStateFromWebContents(mailboxId: string, webContents: WebContents): void {
    const mailbox = this.findInbox(mailboxId);

    if (!mailbox) {
      return;
    }

    this.syncViewState(mailboxId, {
      canGoBack: webContents.canGoBack(),
      canGoForward: webContents.canGoForward(),
      currentUrl: webContents.getURL() || mailbox.targetUrl,
      isLoading: webContents.isLoading(),
    });
  }

  private async syncAccountAvatar(mailboxId: string, provider: MailboxProvider, webContents: WebContents): Promise<void> {
    if (webContents.isDestroyed()) {
      return;
    }

    const mailbox = this.findInbox(mailboxId);

    if (!mailbox) {
      return;
    }

    const avatarUrl = await this.extractAccountAvatarUrl(provider, webContents);

    if (!avatarUrl || !isAllowedAvatarAssetUrl(provider, avatarUrl) || this.avatarSourceUrls.get(mailboxId) === avatarUrl) {
      return;
    }

    try {
      const response = await webContents.session.fetch(avatarUrl, {
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        return;
      }

      const contentType = response.headers.get('content-type')?.split(';')[0] ?? 'image/png';

      if (!contentType.startsWith('image/')) {
        return;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;

      this.avatarSourceUrls.set(mailboxId, avatarUrl);
      this.updateInbox(mailboxId, (currentMailbox) => ({
        ...currentMailbox,
        accountAvatarDataUrl: dataUrl,
        updatedAt: new Date().toISOString(),
      }));
      this.persistState();
      this.emitState();
    } catch {
      // Best-effort only. Missing avatars must never break mailbox loading.
    }
  }

  private async extractAccountAvatarUrl(provider: MailboxProvider, webContents: WebContents): Promise<string | null> {
    const script = `(() => {
      const selectors = ${
        provider === 'gmail'
          ? JSON.stringify([
              'a[aria-label*="Google Account"] img',
              'button[aria-label*="Google Account"] img',
              'a[href*="SignOutOptions"] img',
              'img[src*="googleusercontent"]',
            ])
          : JSON.stringify([
              'button[aria-label*="Account manager"] img',
              'button[aria-label*="account manager"] img',
              'button[aria-label*="Profile"] img',
              'img[src*="GetPersonaPhoto"]',
              'img[src*="office.com"]',
            ])
      };
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element instanceof HTMLImageElement) {
          const src = element.currentSrc || element.src;
          if (src) {
            return src;
          }
        }
      }
      const fallback = Array.from(document.images).find((image) => {
        const src = image.currentSrc || image.src || '';
        const alt = (image.alt || '').toLowerCase();
        return src.includes('googleusercontent') || src.includes('GetPersonaPhoto') || src.includes('substrate.office') || alt.includes('account') || alt.includes('profile');
      });
      return fallback ? (fallback.currentSrc || fallback.src || null) : null;
    })();`;

    try {
      const result = await webContents.executeJavaScript(script, true);
      return typeof result === 'string' && result.length > 0 ? result : null;
    } catch {
      return null;
    }
  }

  private normalizeMailboxUrl(provider: MailboxProvider, candidateUrl: string): string {
    const trimmedUrl = candidateUrl.trim();
    const nextUrl = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;

    if (!isAllowedMailboxUrl(provider, nextUrl)) {
      throw new Error('Unsupported URL for this inbox.');
    }

    return nextUrl;
  }

  private destroyView(mailboxId: string): void {
    if (this.attachedInboxId === mailboxId) {
      this.detachCurrentView();
    }

    const view = this.views.get(mailboxId);

    if (!view) {
      return;
    }

    this.views.delete(mailboxId);
    this.primedUnreadInboxIds.delete(mailboxId);
    view.webContents.removeAllListeners();

    if (!view.webContents.isDestroyed()) {
      view.webContents.close();
    }
  }

  private shouldSuppressUnreadNotification(mailboxId: string): boolean {
    return this.window.isFocused() && this.selectedInboxId === mailboxId;
  }

  private async showUnreadNotification(
    mailbox: MailboxRecord,
    previousUnreadState: MailboxUnreadSnapshot,
    nextUnreadState: MailboxUnreadSnapshot,
  ): Promise<void> {
    if (!ElectronNotification.isSupported()) {
      return;
    }

    const currentMailbox = this.findInbox(mailbox.id);

    if (!currentMailbox) {
      return;
    }

    const preview = await this.extractUnreadPreview(currentMailbox.id, currentMailbox.provider);
    const latestMailbox = this.findInbox(currentMailbox.id);

    if (!latestMailbox) {
      return;
    }

    const notification = new ElectronNotification({
      title: latestMailbox.displayName,
      subtitle: getUnreadNotificationSubtitle(latestMailbox.provider, preview),
      body: getUnreadNotificationBodyWithPreview(previousUnreadState, nextUnreadState, preview),
    });

    const dispose = () => {
      this.activeNotifications.delete(notification);
      notification.removeAllListeners();
    };

    notification.once('click', () => {
      dispose();

      if (this.window.isDestroyed() || !this.findInbox(latestMailbox.id)) {
        return;
      }

      if (this.window.isMinimized()) {
        this.window.restore();
      }

      this.window.show();
      this.window.focus();
      void this.openNotificationTarget(latestMailbox.id, latestMailbox.provider, preview);
    });

    notification.once('close', () => {
      dispose();
    });

    this.activeNotifications.add(notification);
    notification.show();
  }

  private async extractUnreadPreview(mailboxId: string, provider: MailboxProvider): Promise<MailboxUnreadPreview | null> {
    const view = this.views.get(mailboxId);

    if (!view || view.webContents.isDestroyed()) {
      return null;
    }

    const script = `(() => {
      const config = ${JSON.stringify(getUnreadPreviewDomConfig(provider))};

      const cleanText = (value) => {
        if (typeof value !== 'string') {
          return null;
        }

        const normalizedValue = value.replace(/\\s+/g, ' ').trim();
        return normalizedValue.length > 0 ? normalizedValue : null;
      };

      const findText = (root, selectors) => {
        for (const selector of selectors) {
          const element = root.querySelector(selector);

          if (!(element instanceof HTMLElement)) {
            continue;
          }

          const candidate = cleanText(
            element.getAttribute('aria-label') ||
              element.getAttribute('title') ||
              element.innerText ||
              element.textContent ||
              '',
          );

          if (candidate) {
            return candidate;
          }
        }

        return null;
      };

      const uniqueRows = [];
      const seenRows = new Set();

      for (const selector of config.rowSelectors) {
        for (const element of document.querySelectorAll(selector)) {
          if (!(element instanceof HTMLElement) || seenRows.has(element)) {
            continue;
          }

          seenRows.add(element);
          uniqueRows.push(element);
        }
      }

      const row = uniqueRows[0];

      if (!(row instanceof HTMLElement)) {
        return null;
      }

      const findAttributeValue = (element, attributes) => {
        for (const attribute of attributes) {
          const candidate = cleanText(element.getAttribute(attribute) || '');

          if (candidate) {
            return candidate;
          }
        }

        return null;
      };

      const findHref = (root, selectors) => {
        for (const selector of selectors) {
          const element = root.querySelector(selector);

          if (!(element instanceof HTMLAnchorElement)) {
            continue;
          }

          const href = cleanText(element.href || element.getAttribute('href') || '');

          if (href) {
            return href;
          }
        }

        return null;
      };

      return {
        sender: findText(row, config.senderSelectors),
        subject: findText(row, config.subjectSelectors),
        preview: findText(row, config.previewSelectors),
        rowKey: findAttributeValue(row, config.keyAttributes),
        secondaryRowKey: findAttributeValue(row, config.secondaryKeyAttributes),
        actionUrl: findHref(row, config.linkSelectors),
      };
    })();`;

    try {
      const result = await view.webContents.executeJavaScript(script, true);

      if (!result || typeof result !== 'object') {
        return null;
      }

      const preview = result as Partial<MailboxUnreadPreview>;

      return {
        sender: truncateText(typeof preview.sender === 'string' ? preview.sender : null, 80),
        subject: truncateText(typeof preview.subject === 'string' ? preview.subject : null, 120),
        preview: truncateText(typeof preview.preview === 'string' ? preview.preview : null, 180),
        rowKey: truncateText(typeof preview.rowKey === 'string' ? preview.rowKey : null, 160),
        secondaryRowKey: truncateText(typeof preview.secondaryRowKey === 'string' ? preview.secondaryRowKey : null, 160),
        actionUrl: typeof preview.actionUrl === 'string' ? preview.actionUrl : null,
      };
    } catch {
      return null;
    }
  }

  private async openNotificationTarget(
    mailboxId: string,
    provider: MailboxProvider,
    preview: MailboxUnreadPreview | null,
  ): Promise<void> {
    await this.selectInbox(mailboxId);

    const view = this.views.get(mailboxId);

    if (preview && view && !view.webContents.isDestroyed()) {
      const openedViaDom = await this.openNotificationTargetInView(view.webContents, provider, preview);

      if (openedViaDom) {
        return;
      }
    }

    if (preview?.actionUrl && isAllowedMailboxUrl(provider, preview.actionUrl)) {
      await this.navigateInbox(mailboxId, preview.actionUrl);
    }
  }

  private async openNotificationTargetInView(
    webContents: WebContents,
    provider: MailboxProvider,
    preview: MailboxUnreadPreview,
  ): Promise<boolean> {
    const script = `((preview) => {
      const config = ${JSON.stringify(getUnreadPreviewDomConfig(provider))};

      const cleanText = (value) => {
        if (typeof value !== 'string') {
          return null;
        }

        const normalizedValue = value.replace(/\\s+/g, ' ').trim();
        return normalizedValue.length > 0 ? normalizedValue : null;
      };

      const getRows = () => {
        const rows = [];
        const seenRows = new Set();

        for (const selector of config.rowSelectors) {
          for (const element of document.querySelectorAll(selector)) {
            if (!(element instanceof HTMLElement) || seenRows.has(element)) {
              continue;
            }

            seenRows.add(element);
            rows.push(element);
          }
        }

        return rows;
      };

      const findText = (root, selectors) => {
        for (const selector of selectors) {
          const element = root.querySelector(selector);

          if (!(element instanceof HTMLElement)) {
            continue;
          }

          const candidate = cleanText(
            element.getAttribute('aria-label') ||
              element.getAttribute('title') ||
              element.innerText ||
              element.textContent ||
              '',
          );

          if (candidate) {
            return candidate;
          }
        }

        return null;
      };

      const findAttributeValue = (element, attributes) => {
        for (const attribute of attributes) {
          const candidate = cleanText(element.getAttribute(attribute) || '');

          if (candidate) {
            return candidate;
          }
        }

        return null;
      };

      const sameValue = (left, right) => Boolean(left) && Boolean(right) && cleanText(left) === cleanText(right);
      const rowMatches = (row) => {
        const rowKey = findAttributeValue(row, config.keyAttributes);
        const secondaryRowKey = findAttributeValue(row, config.secondaryKeyAttributes);

        if (sameValue(preview.rowKey, rowKey) || sameValue(preview.secondaryRowKey, secondaryRowKey)) {
          return true;
        }

        const sender = findText(row, config.senderSelectors);
        const subject = findText(row, config.subjectSelectors);
        const bodyPreview = findText(row, config.previewSelectors);

        return (
          (sameValue(preview.subject, subject) && sameValue(preview.sender, sender)) ||
          (sameValue(preview.subject, subject) && sameValue(preview.preview, bodyPreview)) ||
          (sameValue(preview.sender, sender) && sameValue(preview.preview, bodyPreview))
        );
      };

      const row = getRows().find(rowMatches);

      if (!(row instanceof HTMLElement)) {
        return false;
      }

      row.scrollIntoView({ block: 'center', inline: 'nearest' });

      const clickTarget =
        config.linkSelectors
          .map((selector) => row.querySelector(selector))
          .find((element) => element instanceof HTMLElement) ??
        row;

      if (!(clickTarget instanceof HTMLElement)) {
        return false;
      }

      clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      clickTarget.click();

      return true;
    })(${JSON.stringify(preview)});`;

    try {
      const result = await webContents.executeJavaScript(script, true);
      return result === true;
    } catch {
      return false;
    }
  }
}
