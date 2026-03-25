import {
  app,
  BrowserWindow,
  Notification as ElectronNotification,
  nativeImage,
  type Rectangle,
  shell,
  type WebContents,
  WebContentsView,
} from 'electron';
import path from 'node:path';

import { DEFAULT_APP_APPEARANCE_SETTINGS, isAppAccentThemeId, type AppAppearanceSettings, type AppAccentThemeId } from '@shared/appearance';
import {
  DEFAULT_MAILBOX_GROUP_ICON_ID,
  DEFAULT_MAILBOX_GROUP_ID,
  compareMailboxGroups,
  getAggregateUnreadCount,
  getDefaultMailboxGroupIconId,
  getMailboxGroupEmojiFallback,
  isMailboxAutoSleepMinutes,
  isMailboxGroupIconId,
  normalizeMailboxGroupEmoji,
  getDefaultDisplayName,
  getProviderLabel,
  compareMailboxes,
  hasAggregateUnreadDot,
  type MailboxGroup,
  type PersistedMailboxNotificationState,
  type MailboxUnreadState,
  type MailboxProvider,
  type MailboxRecord,
} from '@shared/mailboxes';
import type {
  CreateGroupInput,
  CreateMailboxInput,
  MailboxViewState,
  MailToasterState,
  MailboxViewport,
  SaveSidebarLayoutInput,
  UpdateGroupInput,
  UpdateMailboxInput,
} from '@shared/ipc';

import { APP_NAME } from '@shared/mailboxes';

import { AppStore } from '../persistence/app-store';
import { getDefaultTargetUrl, isAllowedAvatarAssetUrl, isAllowedMailboxUrl, isResumableMailboxUrl } from './provider-config';
import { parseUnreadFromTitle } from './unread';

const MAILBOX_VIEW_BORDER_RADIUS = 16;
const MINUTE_IN_MS = 60_000;
const UNREAD_NOTIFICATION_RESET_GRACE_PERIOD_MS = 10_000;

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

interface BrowserIdentity {
  acceptLanguages: string;
  secChUa: string;
  secChUaFullVersion: string;
  secChUaFullVersionList: string;
  secChUaMobile: string;
  secChUaPlatform: string;
  userAgent: string;
}

function canGoBack(webContents: WebContents): boolean {
  return webContents.navigationHistory.canGoBack();
}

function canGoForward(webContents: WebContents): boolean {
  return webContents.navigationHistory.canGoForward();
}

function getChromeVersion(): string {
  return process.versions.chrome || '141.0.0.0';
}

function getChromeMajorVersion(): string {
  return getChromeVersion().split('.')[0] || '141';
}

function getBrowserIdentityForPlatform(): BrowserIdentity {
  const chromeVersion = getChromeVersion();
  const chromeMajorVersion = getChromeMajorVersion();
  const acceptLanguages = 'en-US,en';
  const secChUa = `"Google Chrome";v="${chromeMajorVersion}", "Chromium";v="${chromeMajorVersion}", "Not_A Brand";v="24"`;
  const secChUaFullVersion = `"${chromeVersion}"`;
  const secChUaFullVersionList = `"Google Chrome";v="${chromeVersion}", "Chromium";v="${chromeVersion}", "Not_A Brand";v="24.0.0.0"`;
  const secChUaMobile = '?0';

  switch (process.platform) {
    case 'win32':
      return {
        acceptLanguages,
        secChUa,
        secChUaFullVersion,
        secChUaFullVersionList,
        secChUaMobile,
        secChUaPlatform: '"Windows"',
        userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`,
      };
    case 'linux':
      return {
        acceptLanguages,
        secChUa,
        secChUaFullVersion,
        secChUaFullVersionList,
        secChUaMobile,
        secChUaPlatform: '"Linux"',
        userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`,
      };
    case 'darwin':
    default:
      return {
        acceptLanguages,
        secChUa,
        secChUaFullVersion,
        secChUaFullVersionList,
        secChUaMobile,
        secChUaPlatform: '"macOS"',
        userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`,
      };
  }
}

function getProviderBrowserIdentity(provider: MailboxProvider): BrowserIdentity | null {
  if (provider !== 'whatsapp') {
    return null;
  }

  return getBrowserIdentityForPlatform();
}

function setRequestHeader(headers: Record<string, string | string[]>, name: string, value: string): void {
  const existingHeaderName = Object.keys(headers).find((headerName) => headerName.toLowerCase() === name.toLowerCase());

  if (existingHeaderName) {
    delete headers[existingHeaderName];
  }

  headers[name] = value;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getAggregateUnreadBadgeLabel(totalUnreadCount: number, hasUnreadDot: boolean): string | null {
  if (totalUnreadCount > 0) {
    return totalUnreadCount > 99 ? '99+' : `${totalUnreadCount}${hasUnreadDot ? '+' : ''}`;
  }

  return hasUnreadDot ? '•' : null;
}

function createWindowsUnreadOverlayIcon(label: string) {
  const fontSize = label.length >= 3 ? 26 : label.length === 2 ? 30 : 34;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill="#D24D41" />
      <text
        x="32"
        y="40"
        text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        fill="#FFFFFF"
      >${escapeSvgText(label)}</text>
    </svg>
  `.trim();

  return nativeImage
    .createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
    .resize({ width: 32, height: 32 });
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

function getUnreadNotificationSignature(
  next: MailboxUnreadSnapshot,
  preview: MailboxUnreadPreview | null,
): string {
  const normalizedParts = [
    preview?.actionUrl,
    preview?.rowKey,
    preview?.secondaryRowKey,
    preview?.sender,
    preview?.subject,
    preview?.preview,
    next.unreadState,
    next.unreadCount === null ? null : String(next.unreadCount),
  ]
    .map((value) => {
      if (typeof value !== 'string') {
        return null;
      }

      const normalizedValue = value.replace(/\s+/g, ' ').trim();
      return normalizedValue.length > 0 ? normalizedValue : null;
    })
    .filter((value): value is string => Boolean(value));

  return normalizedParts.length > 0 ? normalizedParts.join('||') : `${next.unreadState}:${next.unreadCount ?? ''}`;
}

function isLikelyThreadView(provider: MailboxProvider, candidateUrl: string): boolean {
  try {
    const { hash, pathname } = new URL(candidateUrl);

    switch (provider) {
      case 'gmail': {
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
      case 'outlook':
        return pathname.includes('/mail/id/') || pathname.includes('/mail/deeplink/read/');
      case 'protonmail':
        return pathname.split('/').filter(Boolean).length > 3;
      case 'whatsapp':
        return false;
    }
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
  switch (provider) {
    case 'gmail':
      return {
        rowSelectors: ['tr.zA.zE', 'tr.zE', 'tr.zA', 'tr[aria-label*="unread"]', 'tr[role="row"]'],
        senderSelectors: ['.yP', '.yW span[email]', '.yW span', '.yW'],
        subjectSelectors: ['.bog span', '.bog'],
        previewSelectors: ['.y2', '.y6 .y2'],
        linkSelectors: ['a[href*="#"]', 'a[href*="/mail/"]'],
        keyAttributes: ['data-legacy-message-id', 'data-message-id', 'data-legacy-thread-id', 'data-thread-id'],
        secondaryKeyAttributes: ['data-legacy-thread-id', 'data-thread-id'],
      };
    case 'outlook':
      return {
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
    case 'protonmail':
      return {
        rowSelectors: [
          '[data-testid*="message-row"]',
          '[data-testid*="conversation-row"]',
          '[aria-label*="Unread"]',
          '[aria-label*="unread"]',
          '[role="row"]',
          '[data-element-id]',
        ],
        senderSelectors: ['[data-testid*="sender"]', '[data-testid*="participant"]', '[title]', '[aria-label]'],
        subjectSelectors: ['[data-testid*="subject"]', '[data-testid*="conversation"]', '[title]'],
        previewSelectors: ['[data-testid*="summary"]', '[data-testid*="snippet"]', '[data-testid*="preview"]'],
        linkSelectors: ['a[href*="/u/"]', 'a[href*="proton.me"]'],
        keyAttributes: ['data-testid', 'data-element-id', 'data-message-id'],
        secondaryKeyAttributes: ['data-element-id', 'data-message-id'],
      };
    case 'whatsapp':
      return {
        rowSelectors: [],
        senderSelectors: [],
        subjectSelectors: [],
        previewSelectors: [],
        linkSelectors: [],
        keyAttributes: [],
        secondaryKeyAttributes: [],
      };
  }
}

export class MailboxManager {
  private readonly configuredPartitions = new Set<string>();
  private readonly views = new Map<string, WebContentsView>();
  private readonly viewStates = new Map<string, MailboxViewState>();
  private readonly avatarSourceUrls = new Map<string, string>();
  private readonly activeNotifications = new Set<ElectronNotification>();
  private readonly autoSleepTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly unreadNotificationResetTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly primedUnreadInboxIds = new Set<string>();
  private readonly unreadNotificationStateByInboxId: Map<string, PersistedMailboxNotificationState>;
  private groups: MailboxGroup[];
  private inboxes: MailboxRecord[];
  private appearanceSettings: AppAppearanceSettings;
  private selectedInboxId: string | null;
  private attachedInboxId: string | null = null;
  private nativeOverlayVisible = false;
  private viewport: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

  constructor(
    private readonly window: BrowserWindow,
    private readonly store: AppStore,
  ) {
    const state = this.store.getState();

    this.groups = [...state.groups].sort(compareMailboxGroups);
    this.inboxes = [...state.inboxes];
    this.appearanceSettings = state.appearanceSettings ?? DEFAULT_APP_APPEARANCE_SETTINGS;
    this.selectedInboxId = this.resolveSelectedInbox(state.selectedInboxId);
    this.unreadNotificationStateByInboxId = new Map(
      Object.entries(state.mailboxNotificationState).map(([mailboxId, notificationState]) => [mailboxId, { ...notificationState }]),
    );
    this.clearStaleUnreadNotificationState();

    for (const inbox of this.inboxes) {
      this.viewStates.set(inbox.id, {
        canGoBack: false,
        canGoForward: false,
        currentUrl: inbox.resumeUrl ?? inbox.targetUrl,
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

      this.syncAutoSleepTimer(inbox.id);
    }

    this.persistState();
    this.emitState();
  }

  dispose(): void {
    this.detachCurrentView();

    for (const mailboxId of [...this.autoSleepTimeouts.keys()]) {
      this.clearAutoSleepTimer(mailboxId);
    }

    for (const mailboxId of [...this.unreadNotificationResetTimeouts.keys()]) {
      this.clearUnreadNotificationResetTimeout(mailboxId);
    }

    for (const inboxId of [...this.views.keys()]) {
      this.destroyView(inboxId);
    }
  }

  getState(): MailToasterState {
    return {
      groups: [...this.groups].sort(compareMailboxGroups),
      inboxes: [...this.inboxes],
      selectedInboxId: this.selectedInboxId,
      viewStates: Object.fromEntries(this.viewStates.entries()),
      appearanceSettings: this.appearanceSettings,
    };
  }

  async setAccentTheme(accentThemeId: AppAccentThemeId): Promise<void> {
    if (!isAppAccentThemeId(accentThemeId) || this.appearanceSettings.accentThemeId === accentThemeId) {
      return;
    }

    this.appearanceSettings = {
      ...this.appearanceSettings,
      accentThemeId,
    };

    this.persistState();
    this.emitState();
  }

  async setNativeOverlayVisible(visible: boolean): Promise<void> {
    if (this.nativeOverlayVisible === visible) {
      return;
    }

    this.nativeOverlayVisible = visible;
    this.attachSelectedView();
  }

  async createInbox(input: CreateMailboxInput): Promise<void> {
    const trimmedName = input.displayName?.trim();
    const groupId = this.resolveGroupId(input.groupId);
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const sameProviderCount = this.inboxes.filter((inbox) => inbox.provider === input.provider).length;
    const displayName = trimmedName && trimmedName.length > 0 ? trimmedName : getDefaultDisplayName(input.provider, sameProviderCount);
    const sortOrder = this.getInboxesForGroup(groupId).length;

    const mailbox: MailboxRecord = {
      id,
      provider: input.provider,
      displayName,
      targetUrl: getDefaultTargetUrl(input.provider),
      resumeUrl: null,
      icon: input.provider,
      accountAvatarDataUrl: null,
      customIconDataUrl: null,
      partition: `persist:inbox-${id}`,
      groupId,
      sleepState: 'awake',
      sleepMode: 'manual',
      sleepAfterMinutes: null,
      unreadCount: null,
      unreadState: 'none',
      sortOrder,
      createdAt,
      updatedAt: createdAt,
    };

    this.inboxes = [...this.inboxes, mailbox];
    this.viewStates.set(mailbox.id, {
      canGoBack: false,
      canGoForward: false,
      currentUrl: mailbox.resumeUrl ?? mailbox.targetUrl,
      isLoading: true,
    });
    this.selectedInboxId = mailbox.id;
    this.ensureView(mailbox.id);
    this.persistState();
    this.attachSelectedView();
    this.emitState();
  }

  async createGroup(input: CreateGroupInput): Promise<void> {
    const trimmedName = input.name.trim();
    const createdAt = new Date().toISOString();
    const group: MailboxGroup = {
      id: crypto.randomUUID(),
      name: trimmedName || this.getNextGroupName(),
      icon: DEFAULT_MAILBOX_GROUP_ICON_ID,
      emoji: normalizeMailboxGroupEmoji(input.emoji) ?? getMailboxGroupEmojiFallback(undefined, DEFAULT_MAILBOX_GROUP_ICON_ID),
      sortOrder: this.groups.length,
      collapsed: false,
      createdAt,
      updatedAt: createdAt,
    };

    this.groups = [...this.groups, group].sort(compareMailboxGroups);
    this.persistState();
    this.emitState();
  }

  async renameGroup(id: string, input: UpdateGroupInput): Promise<void> {
    const trimmedName = input.name.trim();

    if (!trimmedName) {
      throw new Error('Group name is required.');
    }

    this.updateGroup(id, (group) => ({
      ...group,
      name: trimmedName,
      icon: isMailboxGroupIconId(group.icon) ? group.icon : getDefaultMailboxGroupIconId(group.id),
      emoji: normalizeMailboxGroupEmoji(input.emoji) ?? getMailboxGroupEmojiFallback(group.id, group.icon),
      updatedAt: new Date().toISOString(),
    }));

    this.persistState();
    this.emitState();
  }

  async removeGroup(id: string): Promise<void> {
    if (id === DEFAULT_MAILBOX_GROUP_ID) {
      return;
    }

    const group = this.findGroup(id);

    if (!group) {
      return;
    }

    const currentLayout = this.getCurrentSidebarLayout();
    const groupToRemove = currentLayout.groups.find((entry) => entry.groupId === id);
    const defaultGroup = currentLayout.groups.find((entry) => entry.groupId === DEFAULT_MAILBOX_GROUP_ID);

    if (!groupToRemove || !defaultGroup) {
      return;
    }

    const updatedAt = new Date().toISOString();
    const nextGroups = this.getOrderedGroups()
      .filter((currentGroup) => currentGroup.id !== id)
      .map((currentGroup, index) => ({
        ...currentGroup,
        sortOrder: index,
        updatedAt: currentGroup.sortOrder !== index ? updatedAt : currentGroup.updatedAt,
      }));
    const nextGroupLayouts = currentLayout.groups
      .filter((entry) => entry.groupId !== id)
      .map((entry) =>
        entry.groupId === DEFAULT_MAILBOX_GROUP_ID
          ? {
              ...entry,
              inboxIds: [...entry.inboxIds, ...groupToRemove.inboxIds],
            }
          : entry,
      );
    const currentInboxById = new Map(this.inboxes.map((inbox) => [inbox.id, inbox]));

    this.groups = nextGroups;
    this.inboxes = nextGroupLayouts.flatMap((layout) =>
      layout.inboxIds.map((inboxId, index) => {
        const inbox = currentInboxById.get(inboxId)!;
        const positionChanged = inbox.groupId !== layout.groupId || inbox.sortOrder !== index;

        return {
          ...inbox,
          groupId: layout.groupId,
          sortOrder: index,
          updatedAt: positionChanged ? updatedAt : inbox.updatedAt,
        };
      }),
    );

    this.persistState();
    this.emitState();
  }

  async setGroupCollapsed(id: string, collapsed: boolean): Promise<void> {
    const group = this.findGroup(id);

    if (!group || group.collapsed === collapsed) {
      return;
    }

    this.updateGroup(id, (currentGroup) => ({
      ...currentGroup,
      collapsed,
      updatedAt: new Date().toISOString(),
    }));

    this.persistState();
    this.emitState();
  }

  async saveSidebarLayout(input: SaveSidebarLayoutInput): Promise<void> {
    if (!this.applySidebarLayout(input)) {
      return;
    }

    this.persistState();
    this.emitState();
  }

  async updateInbox(id: string, input: UpdateMailboxInput): Promise<void> {
    const mailbox = this.findInbox(id);

    if (!mailbox) {
      return;
    }

    const trimmedName = input.displayName.trim();

    if (!trimmedName) {
      throw new Error('Display name is required.');
    }

    const nextGroupId = this.resolveGroupId(input.groupId);
    let changed = false;

    if (mailbox.groupId !== nextGroupId) {
      const currentLayout = this.getCurrentSidebarLayout();
      const nextLayout: SaveSidebarLayoutInput = {
        groups: currentLayout.groups.map((group) => {
          if (group.groupId === mailbox.groupId) {
            return {
              ...group,
              inboxIds: group.inboxIds.filter((inboxId) => inboxId !== id),
            };
          }

          if (group.groupId === nextGroupId) {
            return {
              ...group,
              inboxIds: [...group.inboxIds, id],
            };
          }

          return group;
        }),
      };

      changed = this.applySidebarLayout(nextLayout) || changed;
    }

    const currentMailbox = this.findInbox(id);

    if (currentMailbox && currentMailbox.displayName !== trimmedName) {
      this.mutateInbox(id, (nextMailbox) => ({
        ...nextMailbox,
        displayName: trimmedName,
        updatedAt: new Date().toISOString(),
      }));
      changed = true;
    }

    if (!changed) {
      return;
    }

    this.persistState();
    this.emitState();
  }

  async renameInbox(id: string, displayName: string): Promise<void> {
    const trimmedName = displayName.trim();

    if (!trimmedName) {
      throw new Error('Display name is required.');
    }

    this.mutateInbox(id, (mailbox) => ({
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

    this.mutateInbox(id, (mailbox) => ({
      ...mailbox,
      customIconDataUrl,
      updatedAt: new Date().toISOString(),
    }));

    this.persistState();
    this.emitState();
  }

  async clearInboxCustomIcon(id: string): Promise<void> {
    this.mutateInbox(id, (mailbox) => ({
      ...mailbox,
      customIconDataUrl: null,
      updatedAt: new Date().toISOString(),
    }));

    this.persistState();
    this.emitState();
  }

  async reorderInboxes(orderedInboxIds: string[]): Promise<void> {
    if (this.groups.length !== 1) {
      return;
    }

    await this.saveSidebarLayout({
      groups: [
        {
          groupId: this.groups[0]!.id,
          inboxIds: orderedInboxIds,
        },
      ],
    });
  }

  async removeInbox(id: string): Promise<void> {
    const mailbox = this.findInbox(id);

    if (!mailbox) {
      return;
    }

    const remainingInboxes = this.inboxes.filter((inbox) => inbox.id !== id);
    this.clearAutoSleepTimer(id);
    this.destroyView(id);
    this.avatarSourceUrls.delete(id);
    this.viewStates.delete(id);
    this.inboxes = remainingInboxes;
    this.applySidebarLayout(this.getCurrentSidebarLayout());

    if (this.selectedInboxId === id) {
      this.selectedInboxId = this.getFirstInboxId();
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

    if (mailbox.sleepState === 'sleeping') {
      await this.wakeInbox(id);
      return;
    }

    this.ensureView(id);
    this.recordMailboxActivity(id);
    this.persistState();
    this.attachSelectedView();
    this.emitState();
  }

  async sleepInbox(id: string): Promise<void> {
    const mailbox = this.findInbox(id);

    if (!mailbox || mailbox.sleepState === 'sleeping') {
      return;
    }

    this.mutateInbox(id, (currentMailbox) => ({
      ...currentMailbox,
      sleepState: 'sleeping',
      updatedAt: new Date().toISOString(),
    }));

    this.clearAutoSleepTimer(id);
    this.destroyView(id);
    this.persistState();
    this.attachSelectedView();
    this.emitState();
  }

  async setInboxAutoSleep(id: string, minutes: number | null): Promise<void> {
    const mailbox = this.findInbox(id);

    if (!mailbox) {
      return;
    }

    if (minutes !== null && !isMailboxAutoSleepMinutes(minutes)) {
      throw new Error('Unsupported auto-sleep duration.');
    }

    const nextSleepMode = minutes === null ? 'manual' : 'inactivity';

    if (mailbox.sleepMode === nextSleepMode && mailbox.sleepAfterMinutes === minutes) {
      return;
    }

    this.mutateInbox(id, (currentMailbox) => ({
      ...currentMailbox,
      sleepMode: nextSleepMode,
      sleepAfterMinutes: minutes,
      updatedAt: new Date().toISOString(),
    }));

    this.syncAutoSleepTimer(id);
    this.persistState();
    this.emitState();
  }

  async wakeInbox(id: string): Promise<void> {
    const mailbox = this.findInbox(id);

    if (!mailbox || mailbox.sleepState === 'awake') {
      return;
    }

    this.mutateInbox(id, (currentMailbox) => ({
      ...currentMailbox,
      sleepState: 'awake',
      updatedAt: new Date().toISOString(),
    }));

    this.ensureView(id);
    this.recordMailboxActivity(id);
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

    if (view && canGoBack(view.webContents)) {
      this.recordMailboxActivity(id);
      view.webContents.goBack();
    }
  }

  async goForwardInbox(id: string): Promise<void> {
    const view = this.getActiveView(id);

    if (view && canGoForward(view.webContents)) {
      this.recordMailboxActivity(id);
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
      this.recordMailboxActivity(id);
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

    this.recordMailboxActivity(id);

    this.syncViewState(id, {
      canGoBack: canGoBack(view.webContents),
      canGoForward: canGoForward(view.webContents),
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

    return this.getFirstInboxId();
  }

  private getSelectedInbox(): MailboxRecord | undefined {
    return this.selectedInboxId ? this.findInbox(this.selectedInboxId) : undefined;
  }

  private getStartupUrl(mailbox: MailboxRecord): string {
    return mailbox.resumeUrl && isResumableMailboxUrl(mailbox.provider, mailbox.resumeUrl) ? mailbox.resumeUrl : mailbox.targetUrl;
  }

  private getFirstInboxId(): string | null {
    for (const group of this.getOrderedGroups()) {
      const firstInboxId = this.getInboxesForGroup(group.id)[0]?.id;

      if (firstInboxId) {
        return firstInboxId;
      }
    }

    return null;
  }

  private findGroup(id: string): MailboxGroup | undefined {
    return this.groups.find((group) => group.id === id);
  }

  private findInbox(id: string): MailboxRecord | undefined {
    return this.inboxes.find((inbox) => inbox.id === id);
  }

  private getMailboxIdForWebContents(sender: WebContents): string | null {
    for (const [mailboxId, view] of this.views.entries()) {
      if (view.webContents === sender || view.webContents.id === sender.id) {
        return mailboxId;
      }
    }

    return null;
  }

  private getOrderedGroups(): MailboxGroup[] {
    return [...this.groups].sort(compareMailboxGroups);
  }

  private getInboxesForGroup(groupId: string): MailboxRecord[] {
    return this.inboxes.filter((inbox) => inbox.groupId === groupId).sort(compareMailboxes);
  }

  private resolveGroupId(candidateId?: string | null): string {
    if (candidateId && this.groups.some((group) => group.id === candidateId)) {
      return candidateId;
    }

    return DEFAULT_MAILBOX_GROUP_ID;
  }

  private getNextGroupName(): string {
    const customGroupCount = this.groups.filter((group) => group.id !== DEFAULT_MAILBOX_GROUP_ID).length;
    return `Group ${customGroupCount + 1}`;
  }

  private getActiveView(id: string): WebContentsView | undefined {
    const mailbox = this.findInbox(id);

    if (!mailbox || mailbox.sleepState === 'sleeping') {
      return undefined;
    }

    return this.ensureView(id);
  }

  private mutateInbox(id: string, updater: (mailbox: MailboxRecord) => MailboxRecord): void {
    this.inboxes = this.inboxes.map((mailbox) => (mailbox.id === id ? updater(mailbox) : mailbox));
  }

  private updateGroup(id: string, updater: (group: MailboxGroup) => MailboxGroup): void {
    this.groups = this.groups.map((group) => (group.id === id ? updater(group) : group)).sort(compareMailboxGroups);
  }

  private getCurrentSidebarLayout(): SaveSidebarLayoutInput {
    return {
      groups: this.getOrderedGroups().map((group) => ({
        groupId: group.id,
        inboxIds: this.getInboxesForGroup(group.id).map((inbox) => inbox.id),
      })),
    };
  }

  private applySidebarLayout(input: SaveSidebarLayoutInput): boolean {
    const nextGroupLayouts = input.groups.map((group) => ({
      groupId: group.groupId,
      inboxIds: [...new Set(group.inboxIds)],
    }));

    if (nextGroupLayouts.length !== this.groups.length) {
      return false;
    }

    const currentGroupById = new Map(this.groups.map((group) => [group.id, group]));
    const currentInboxById = new Map(this.inboxes.map((inbox) => [inbox.id, inbox]));

    if (nextGroupLayouts.some((group) => !currentGroupById.has(group.groupId))) {
      return false;
    }

    const nextGroupIds = nextGroupLayouts.map((group) => group.groupId);

    if (new Set(nextGroupIds).size !== nextGroupIds.length) {
      return false;
    }

    const nextInboxIds = nextGroupLayouts.flatMap((group) => group.inboxIds);

    if (nextInboxIds.length !== this.inboxes.length || new Set(nextInboxIds).size !== nextInboxIds.length) {
      return false;
    }

    if (nextInboxIds.some((inboxId) => !currentInboxById.has(inboxId))) {
      return false;
    }

    const updatedAt = new Date().toISOString();
    let changed = false;

    this.groups = nextGroupLayouts.map((layout, index) => {
      const currentGroup = currentGroupById.get(layout.groupId)!;
      const sortChanged = currentGroup.sortOrder !== index;
      changed = changed || sortChanged;

      return {
        ...currentGroup,
        sortOrder: index,
        updatedAt: sortChanged ? updatedAt : currentGroup.updatedAt,
      };
    });

    this.inboxes = nextGroupLayouts.flatMap((layout) =>
      layout.inboxIds.map((inboxId, index) => {
        const currentInbox = currentInboxById.get(inboxId)!;
        const positionChanged = currentInbox.groupId !== layout.groupId || currentInbox.sortOrder !== index;
        changed = changed || positionChanged;

        return {
          ...currentInbox,
          groupId: layout.groupId,
          sortOrder: index,
          updatedAt: positionChanged ? updatedAt : currentInbox.updatedAt,
        };
      }),
    );

    return changed;
  }

  private clearAutoSleepTimer(mailboxId: string): void {
    const timeout = this.autoSleepTimeouts.get(mailboxId);

    if (!timeout) {
      return;
    }

    clearTimeout(timeout);
    this.autoSleepTimeouts.delete(mailboxId);
  }

  private syncAutoSleepTimer(mailboxId: string): void {
    this.clearAutoSleepTimer(mailboxId);

    const mailbox = this.findInbox(mailboxId);

    if (!mailbox || mailbox.sleepState === 'sleeping' || mailbox.sleepMode !== 'inactivity' || !mailbox.sleepAfterMinutes) {
      return;
    }

    const timeout = setTimeout(() => {
      void this.sleepInbox(mailboxId);
    }, mailbox.sleepAfterMinutes * MINUTE_IN_MS);

    if (typeof timeout.unref === 'function') {
      timeout.unref();
    }

    this.autoSleepTimeouts.set(mailboxId, timeout);
  }

  private recordMailboxActivity(mailboxId: string): void {
    this.syncAutoSleepTimer(mailboxId);
  }

  private persistResumeUrl(mailboxId: string, provider: MailboxProvider, candidateUrl: string): void {
    if (!isResumableMailboxUrl(provider, candidateUrl)) {
      return;
    }

    const mailbox = this.findInbox(mailboxId);

    if (!mailbox || mailbox.resumeUrl === candidateUrl) {
      return;
    }

    this.mutateInbox(mailboxId, (currentMailbox) => ({
      ...currentMailbox,
      resumeUrl: candidateUrl,
    }));
    this.persistState();
  }

  private persistState(): void {
    this.store.saveMailboxState(
      this.groups,
      this.inboxes,
      this.selectedInboxId,
      this.getPersistedNotificationState(),
      this.appearanceSettings,
    );
  }

  private emitState(): void {
    this.syncApplicationBadge();

    if (this.window.isDestroyed()) {
      return;
    }

    this.window.setTitle(APP_NAME);
    this.window.webContents.send('mail-toaster:state-changed', this.getState());
  }

  private syncApplicationBadge(): void {
    const totalUnreadCount = getAggregateUnreadCount(this.inboxes);
    const hasUnreadDot = hasAggregateUnreadDot(this.inboxes);
    const badgeLabel = getAggregateUnreadBadgeLabel(totalUnreadCount, hasUnreadDot);

    if (process.platform === 'darwin' && app.dock) {
      app.dock.setBadge(badgeLabel ?? '');
      return;
    }

    if (process.platform === 'win32' && !this.window.isDestroyed()) {
      this.window.setOverlayIcon(
        badgeLabel ? createWindowsUnreadOverlayIcon(badgeLabel) : null,
        badgeLabel ? `${badgeLabel} unread items` : 'No unread items',
      );
    }
  }

  private clearStaleUnreadNotificationState(): void {
    for (const mailbox of this.inboxes) {
      if (!hasUnread(mailbox)) {
        this.unreadNotificationStateByInboxId.delete(mailbox.id);
      }
    }
  }

  private attachSelectedView(): void {
    if (this.nativeOverlayVisible) {
      this.detachCurrentView();
      return;
    }

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
    const browserIdentity = getProviderBrowserIdentity(mailbox.provider);
    const startupUrl = this.getStartupUrl(mailbox);
    this.syncViewState(mailbox.id, {
      canGoBack: false,
      canGoForward: false,
      currentUrl: startupUrl,
      isLoading: true,
    });
    this.syncViewPerformanceModes();
    void view.webContents.loadURL(
      startupUrl,
      browserIdentity
        ? {
            userAgent: browserIdentity.userAgent,
          }
        : undefined,
    );

    return view;
  }

  private configureView(view: WebContentsView, mailboxId: string, provider: MailboxProvider): void {
    const { webContents } = view;

    this.configurePartition(webContents, mailboxId, provider);
    const browserIdentity = getProviderBrowserIdentity(provider);

    if (browserIdentity) {
      webContents.setUserAgent(browserIdentity.userAgent, browserIdentity.acceptLanguages);
    }

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
      this.persistResumeUrl(mailboxId, provider, webContents.getURL());
      this.applyUnreadState(mailboxId, provider, webContents.getTitle());
      void this.syncAccountAvatar(mailboxId, provider, webContents);
    });

    webContents.on('did-navigate', () => {
      this.syncViewStateFromWebContents(mailboxId, webContents);
      this.persistResumeUrl(mailboxId, provider, webContents.getURL());
      this.recordMailboxActivity(mailboxId);
    });

    webContents.on('did-navigate-in-page', () => {
      this.syncViewStateFromWebContents(mailboxId, webContents);
      this.persistResumeUrl(mailboxId, provider, webContents.getURL());
      this.recordMailboxActivity(mailboxId);
    });

    webContents.on('did-fail-load', () => {
      this.syncViewStateFromWebContents(mailboxId, webContents);
    });

    webContents.on('did-finish-load', () => {
      this.syncViewStateFromWebContents(mailboxId, webContents);
      this.persistResumeUrl(mailboxId, provider, webContents.getURL());
      this.applyUnreadState(mailboxId, provider, webContents.getTitle());
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

  private configurePartition(webContents: WebContents, mailboxId: string, provider: MailboxProvider): void {
    const { session } = webContents;
    const mailbox = this.findInbox(mailboxId);

    if (!mailbox || this.configuredPartitions.has(mailbox.partition)) {
      return;
    }

    session.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false);
    });

    session.setPermissionCheckHandler(() => false);

    if (provider === 'whatsapp') {
      const browserIdentity = getProviderBrowserIdentity(provider);

      if (browserIdentity) {
        session.setUserAgent(browserIdentity.userAgent, browserIdentity.acceptLanguages);
        void session.clearCache().catch(() => undefined);
        session.registerPreloadScript({
          filePath: path.join(__dirname, '..', 'mailboxes', 'whatsapp-preload.js'),
          type: 'frame',
        });
        session.webRequest.onBeforeSendHeaders({ urls: ['https://web.whatsapp.com/*'] }, (details, callback) => {
          const requestHeaders = { ...details.requestHeaders };

          setRequestHeader(requestHeaders, 'User-Agent', browserIdentity.userAgent);
          setRequestHeader(requestHeaders, 'Accept-Language', browserIdentity.acceptLanguages);
          setRequestHeader(requestHeaders, 'Sec-CH-UA', browserIdentity.secChUa);
          setRequestHeader(requestHeaders, 'Sec-CH-UA-Full-Version', browserIdentity.secChUaFullVersion);
          setRequestHeader(requestHeaders, 'Sec-CH-UA-Full-Version-List', browserIdentity.secChUaFullVersionList);
          setRequestHeader(requestHeaders, 'Sec-CH-UA-Mobile', browserIdentity.secChUaMobile);
          setRequestHeader(requestHeaders, 'Sec-CH-UA-Platform', browserIdentity.secChUaPlatform);
          callback({ requestHeaders });
        });
      }
    }

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

    if (!mailbox || !title) {
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

    const unreadStateUnchanged =
      previousUnreadState.unreadState === nextUnreadState.unreadState &&
      previousUnreadState.unreadCount === nextUnreadState.unreadCount;
    const shouldProbeStableUnread =
      isUnreadPrimed &&
      unreadStateUnchanged &&
      hasUnread(nextUnreadState) &&
      (previousUnreadState.unreadState === 'dot' || nextUnreadState.unreadState === 'dot');

    if (unreadStateUnchanged && !shouldProbeStableUnread) {
      return;
    }

    const shouldNotify =
      isUnreadPrimed &&
      (shouldNotifyForUnreadChange(previousUnreadState, nextUnreadState) || shouldProbeStableUnread);

    if (!unreadStateUnchanged) {
      this.mutateInbox(mailboxId, (currentMailbox) => ({
        ...currentMailbox,
        unreadState: nextUnreadState.unreadState,
        unreadCount: nextUnreadState.unreadCount,
        updatedAt: new Date().toISOString(),
      }));

      if (hasUnread(nextUnreadState)) {
        this.clearUnreadNotificationResetTimeout(mailboxId);
      } else {
        this.scheduleUnreadNotificationReset(mailboxId);
      }

      this.persistState();
      this.emitState();
    }

    if (shouldNotify) {
      void this.handleUnreadArrival(mailbox, previousUnreadState, nextUnreadState);
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
      canGoBack: canGoBack(webContents),
      canGoForward: canGoForward(webContents),
      currentUrl: webContents.getURL() || mailbox.targetUrl,
      isLoading: webContents.isLoading(),
    });
  }

  private async syncAccountAvatar(mailboxId: string, provider: MailboxProvider, webContents: WebContents): Promise<void> {
    if (provider === 'whatsapp') {
      return;
    }

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
      this.mutateInbox(mailboxId, (currentMailbox) => ({
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
          : provider === 'outlook'
            ? JSON.stringify([
                'button[aria-label*="Account manager"] img',
                'button[aria-label*="account manager"] img',
                'button[aria-label*="Profile"] img',
                'img[src*="GetPersonaPhoto"]',
                'img[src*="office.com"]',
              ])
            : JSON.stringify([
                'button[aria-label*="Account"] img',
                'button[aria-label*="account"] img',
                'button[aria-label*="Profile"] img',
                'img[src*="proton"]',
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
        return (
          src.includes('googleusercontent') ||
          src.includes('GetPersonaPhoto') ||
          src.includes('substrate.office') ||
          src.includes('proton') ||
          alt.includes('account') ||
          alt.includes('profile')
        );
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
    this.clearUnreadNotificationResetTimeout(mailboxId);
    view.webContents.removeAllListeners();

    if (!view.webContents.isDestroyed()) {
      view.webContents.close();
    }
  }

  private shouldSuppressUnreadNotification(mailboxId: string): boolean {
    return this.window.isFocused() && this.selectedInboxId === mailboxId;
  }

  private getPersistedNotificationState(): Record<string, PersistedMailboxNotificationState> {
    return Object.fromEntries(
      this.inboxes
        .map((mailbox) => {
          const notificationState = this.unreadNotificationStateByInboxId.get(mailbox.id);
          return notificationState ? [mailbox.id, { ...notificationState }] : null;
        })
        .filter((entry): entry is [string, PersistedMailboxNotificationState] => Boolean(entry)),
    );
  }

  private setLastUnreadNotificationSignature(mailboxId: string, signature: string | null): void {
    if (signature) {
      this.unreadNotificationStateByInboxId.set(mailboxId, {
        lastUnreadNotificationSignature: signature,
      });
      return;
    }

    this.unreadNotificationStateByInboxId.delete(mailboxId);
  }

  private clearUnreadNotificationResetTimeout(mailboxId: string): void {
    const timeout = this.unreadNotificationResetTimeouts.get(mailboxId);

    if (!timeout) {
      return;
    }

    clearTimeout(timeout);
    this.unreadNotificationResetTimeouts.delete(mailboxId);
  }

  private scheduleUnreadNotificationReset(mailboxId: string): void {
    this.clearUnreadNotificationResetTimeout(mailboxId);

    const timeout = setTimeout(() => {
      this.unreadNotificationResetTimeouts.delete(mailboxId);

      const mailbox = this.findInbox(mailboxId);

      if (!mailbox || hasUnread(mailbox)) {
        return;
      }

      this.setLastUnreadNotificationSignature(mailboxId, null);
      this.persistState();
    }, UNREAD_NOTIFICATION_RESET_GRACE_PERIOD_MS);

    if (typeof timeout.unref === 'function') {
      timeout.unref();
    }

    this.unreadNotificationResetTimeouts.set(mailboxId, timeout);
  }

  private async handleUnreadArrival(
    mailbox: MailboxRecord,
    previousUnreadState: MailboxUnreadSnapshot,
    nextUnreadState: MailboxUnreadSnapshot,
  ): Promise<void> {
    const currentMailbox = this.findInbox(mailbox.id);

    if (!currentMailbox) {
      return;
    }

    const preview = await this.extractUnreadPreview(currentMailbox.id, currentMailbox.provider);
    const latestMailbox = this.findInbox(currentMailbox.id);

    if (!latestMailbox) {
      return;
    }

    const notificationSignature = getUnreadNotificationSignature(nextUnreadState, preview);
    const previousNotificationSignature =
      this.unreadNotificationStateByInboxId.get(latestMailbox.id)?.lastUnreadNotificationSignature ?? null;

    if (previousNotificationSignature === notificationSignature) {
      return;
    }

    this.setLastUnreadNotificationSignature(latestMailbox.id, notificationSignature);
    this.persistState();

    if (this.shouldSuppressUnreadNotification(latestMailbox.id) || !ElectronNotification.isSupported()) {
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
