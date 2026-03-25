import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { DEFAULT_APP_APPEARANCE_SETTINGS, isAppAccentThemeId, type AppAppearanceSettings } from '@shared/appearance';
import type {
  MailboxGroup,
  MailboxRecord,
  PersistedAppState,
  PersistedMailboxNotificationState,
  PersistedWindowBounds,
} from '@shared/mailboxes';
import {
  DEFAULT_MAILBOX_GROUP_ICON_ID,
  DEFAULT_MAILBOX_GROUP_ID,
  DEFAULT_MAILBOX_GROUP_NAME,
  compareMailboxGroups,
  compareMailboxes,
  getDefaultMailboxGroupIconId,
  getMailboxGroupEmojiFallback,
  isMailboxAutoSleepMinutes,
  isMailboxGroupIconId,
  isMailboxProvider,
  normalizeMailboxGroupEmoji,
  SYSTEM_MAILBOX_GROUP_ICON_ID,
  SYSTEM_MAILBOX_GROUP_EMOJI,
} from '@shared/mailboxes';

const STORE_FILE_NAME = 'mail-toaster-state.json';
const STORE_VERSION = 8;
const DEFAULT_GROUP_TIMESTAMP = '1970-01-01T00:00:00.000Z';

function createDefaultMailboxGroup(): MailboxGroup {
  return {
    id: DEFAULT_MAILBOX_GROUP_ID,
    name: DEFAULT_MAILBOX_GROUP_NAME,
    icon: SYSTEM_MAILBOX_GROUP_ICON_ID,
    emoji: SYSTEM_MAILBOX_GROUP_EMOJI,
    sortOrder: 0,
    collapsed: false,
    createdAt: DEFAULT_GROUP_TIMESTAMP,
    updatedAt: DEFAULT_GROUP_TIMESTAMP,
  };
}

const DEFAULT_STATE: PersistedAppState = {
  version: STORE_VERSION,
  groups: [createDefaultMailboxGroup()],
  inboxes: [],
  selectedInboxId: null,
  windowBounds: null,
  mailboxNotificationState: {},
  appearanceSettings: DEFAULT_APP_APPEARANCE_SETTINGS,
};

function isPersistedMailboxNotificationState(value: unknown): value is PersistedMailboxNotificationState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PersistedMailboxNotificationState>;
  return candidate.lastUnreadNotificationSignature === null || typeof candidate.lastUnreadNotificationSignature === 'string';
}

function sanitizeAppearanceSettings(value: unknown): AppAppearanceSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_APP_APPEARANCE_SETTINGS };
  }

  const candidate = value as Partial<AppAppearanceSettings>;

  return {
    accentThemeId: isAppAccentThemeId(candidate.accentThemeId) ? candidate.accentThemeId : DEFAULT_APP_APPEARANCE_SETTINGS.accentThemeId,
  };
}

function isMailboxGroupRecord(value: unknown): value is MailboxGroup {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const group = value as Partial<MailboxGroup>;

  return (
    typeof group.id === 'string' &&
    typeof group.name === 'string' &&
    (group.icon === undefined || isMailboxGroupIconId(group.icon)) &&
    (group.emoji === undefined || group.emoji === null || typeof group.emoji === 'string') &&
    typeof group.sortOrder === 'number' &&
    typeof group.collapsed === 'boolean' &&
    typeof group.createdAt === 'string' &&
    typeof group.updatedAt === 'string'
  );
}

function isMailboxRecord(value: unknown): value is MailboxRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const mailbox = value as Partial<MailboxRecord>;

  return (
    typeof mailbox.id === 'string' &&
    isMailboxProvider(mailbox.provider) &&
    typeof mailbox.displayName === 'string' &&
    typeof mailbox.targetUrl === 'string' &&
    (mailbox.resumeUrl === null || mailbox.resumeUrl === undefined || typeof mailbox.resumeUrl === 'string') &&
    (mailbox.accountAvatarDataUrl === null ||
      mailbox.accountAvatarDataUrl === undefined ||
      typeof mailbox.accountAvatarDataUrl === 'string') &&
    (mailbox.customIconDataUrl === null ||
      mailbox.customIconDataUrl === undefined ||
      typeof mailbox.customIconDataUrl === 'string') &&
    typeof mailbox.partition === 'string' &&
    (mailbox.groupId === undefined || typeof mailbox.groupId === 'string') &&
    (mailbox.sleepState === 'awake' || mailbox.sleepState === 'sleeping') &&
    (mailbox.sleepMode === undefined || mailbox.sleepMode === 'manual' || mailbox.sleepMode === 'inactivity') &&
    (mailbox.sleepAfterMinutes === undefined || mailbox.sleepAfterMinutes === null || isMailboxAutoSleepMinutes(mailbox.sleepAfterMinutes)) &&
    (mailbox.unreadState === 'none' || mailbox.unreadState === 'dot' || mailbox.unreadState === 'count') &&
    (mailbox.unreadCount === null || typeof mailbox.unreadCount === 'number') &&
    typeof mailbox.sortOrder === 'number' &&
    typeof mailbox.createdAt === 'string' &&
    typeof mailbox.updatedAt === 'string'
  );
}

function sanitizeGroups(value: unknown): MailboxGroup[] {
  const groups = Array.isArray(value) ? value.filter(isMailboxGroupRecord) : [];
  const dedupedGroups = new Map<string, MailboxGroup>();

  for (const group of groups) {
    if (!dedupedGroups.has(group.id)) {
      dedupedGroups.set(group.id, {
        ...group,
        name: group.name.trim() || (group.id === DEFAULT_MAILBOX_GROUP_ID ? DEFAULT_MAILBOX_GROUP_NAME : 'Untitled Group'),
        icon: isMailboxGroupIconId(group.icon) ? group.icon : getDefaultMailboxGroupIconId(group.id),
        emoji: normalizeMailboxGroupEmoji(group.emoji) ?? getMailboxGroupEmojiFallback(group.id, group.icon),
      });
    }
  }

  if (!dedupedGroups.has(DEFAULT_MAILBOX_GROUP_ID)) {
    dedupedGroups.set(DEFAULT_MAILBOX_GROUP_ID, createDefaultMailboxGroup());
  }

  return [...dedupedGroups.values()]
    .sort(compareMailboxGroups)
    .map((group, index) => ({
      ...group,
      name: group.name.trim() || (group.id === DEFAULT_MAILBOX_GROUP_ID ? DEFAULT_MAILBOX_GROUP_NAME : 'Untitled Group'),
      icon:
        group.id === DEFAULT_MAILBOX_GROUP_ID
          ? SYSTEM_MAILBOX_GROUP_ICON_ID
          : isMailboxGroupIconId(group.icon)
            ? group.icon
            : DEFAULT_MAILBOX_GROUP_ICON_ID,
      emoji: normalizeMailboxGroupEmoji(group.emoji) ?? getMailboxGroupEmojiFallback(group.id, group.icon),
      sortOrder: index,
    }));
}

function sanitizeInboxes(value: unknown, groups: MailboxGroup[]): MailboxRecord[] {
  const validGroupIds = new Set(groups.map((group) => group.id));
  const groupedInboxes = new Map<string, MailboxRecord[]>();

  for (const group of groups) {
    groupedInboxes.set(group.id, []);
  }

  const inboxes = Array.isArray(value) ? value.filter(isMailboxRecord) : [];

  for (const mailbox of inboxes) {
    const groupId = mailbox.groupId && validGroupIds.has(mailbox.groupId) ? mailbox.groupId : DEFAULT_MAILBOX_GROUP_ID;
    const nextMailbox: MailboxRecord = {
      ...mailbox,
      groupId,
      resumeUrl: typeof mailbox.resumeUrl === 'string' ? mailbox.resumeUrl : null,
      sleepMode: mailbox.sleepMode === 'inactivity' ? 'inactivity' : 'manual',
      sleepAfterMinutes: isMailboxAutoSleepMinutes(mailbox.sleepAfterMinutes) ? mailbox.sleepAfterMinutes : null,
    };

    groupedInboxes.get(groupId)?.push(nextMailbox);
  }

  return groups.flatMap((group) =>
    (groupedInboxes.get(group.id) ?? [])
      .sort(compareMailboxes)
      .map((mailbox, index) => ({
        ...mailbox,
        sortOrder: index,
      })),
  );
}

function sanitizeState(value: unknown): PersistedAppState {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_STATE };
  }

  const candidate = value as Partial<PersistedAppState>;
  const groups = sanitizeGroups(candidate.groups);
  const inboxes = sanitizeInboxes(candidate.inboxes, groups);

  return {
    version: STORE_VERSION,
    groups,
    inboxes,
    selectedInboxId: typeof candidate.selectedInboxId === 'string' ? candidate.selectedInboxId : null,
    windowBounds:
      candidate.windowBounds && typeof candidate.windowBounds === 'object'
        ? {
            x: typeof candidate.windowBounds.x === 'number' ? candidate.windowBounds.x : undefined,
            y: typeof candidate.windowBounds.y === 'number' ? candidate.windowBounds.y : undefined,
            width:
              typeof candidate.windowBounds.width === 'number' && candidate.windowBounds.width > 0
                ? candidate.windowBounds.width
                : 1440,
            height:
              typeof candidate.windowBounds.height === 'number' && candidate.windowBounds.height > 0
                ? candidate.windowBounds.height
                : 920,
          }
        : null,
    mailboxNotificationState:
      candidate.mailboxNotificationState && typeof candidate.mailboxNotificationState === 'object'
        ? Object.fromEntries(
            Object.entries(candidate.mailboxNotificationState).filter(
              ([mailboxId, notificationState]) =>
                typeof mailboxId === 'string' && isPersistedMailboxNotificationState(notificationState),
            ),
          )
        : {},
    appearanceSettings: sanitizeAppearanceSettings(candidate.appearanceSettings),
  };
}

export class AppStore {
  private readonly filePath: string;
  private state: PersistedAppState;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, STORE_FILE_NAME);
    this.state = this.load();
  }

  getState(): PersistedAppState {
    return structuredClone(this.state);
  }

  saveMailboxState(
    groups: MailboxGroup[],
    inboxes: MailboxRecord[],
    selectedInboxId: string | null,
    mailboxNotificationState: Record<string, PersistedMailboxNotificationState>,
    appearanceSettings: AppAppearanceSettings,
  ): void {
    const activeInboxIds = new Set(inboxes.map((inbox) => inbox.id));

    this.state = {
      ...this.state,
      groups: structuredClone(groups),
      inboxes: structuredClone(inboxes),
      selectedInboxId,
      mailboxNotificationState: Object.fromEntries(
        Object.entries(mailboxNotificationState).filter(
          ([mailboxId, notificationState]) =>
            activeInboxIds.has(mailboxId) && isPersistedMailboxNotificationState(notificationState),
        ),
      ),
      appearanceSettings: sanitizeAppearanceSettings(appearanceSettings),
    };
    this.write();
  }

  saveWindowBounds(bounds: PersistedWindowBounds): void {
    this.state = {
      ...this.state,
      windowBounds: bounds,
    };
    this.write();
  }

  private load(): PersistedAppState {
    try {
      const file = readFileSync(this.filePath, 'utf8');
      return sanitizeState(JSON.parse(file));
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  private write(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });

    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(this.state, null, 2), 'utf8');
    renameSync(tempPath, this.filePath);
    rmSync(tempPath, { force: true });
  }
}
