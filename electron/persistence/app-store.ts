import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { DEFAULT_APP_APPEARANCE_SETTINGS, isAppAccentThemeId, type AppAppearanceSettings } from '@shared/appearance';
import type {
  MailboxRecord,
  PersistedAppState,
  PersistedMailboxNotificationState,
  PersistedWindowBounds,
} from '@shared/mailboxes';

const STORE_FILE_NAME = 'mail-toaster-state.json';
const STORE_VERSION = 3;

const DEFAULT_STATE: PersistedAppState = {
  version: STORE_VERSION,
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

function isMailboxRecord(value: unknown): value is MailboxRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const mailbox = value as Partial<MailboxRecord>;

  return (
    typeof mailbox.id === 'string' &&
    (mailbox.provider === 'gmail' || mailbox.provider === 'outlook') &&
    typeof mailbox.displayName === 'string' &&
    typeof mailbox.targetUrl === 'string' &&
    (mailbox.accountAvatarDataUrl === null ||
      mailbox.accountAvatarDataUrl === undefined ||
      typeof mailbox.accountAvatarDataUrl === 'string') &&
    (mailbox.customIconDataUrl === null ||
      mailbox.customIconDataUrl === undefined ||
      typeof mailbox.customIconDataUrl === 'string') &&
    typeof mailbox.partition === 'string' &&
    (mailbox.sleepState === 'awake' || mailbox.sleepState === 'sleeping') &&
    (mailbox.unreadState === 'none' || mailbox.unreadState === 'dot' || mailbox.unreadState === 'count') &&
    (mailbox.unreadCount === null || typeof mailbox.unreadCount === 'number') &&
    typeof mailbox.sortOrder === 'number' &&
    typeof mailbox.createdAt === 'string' &&
    typeof mailbox.updatedAt === 'string'
  );
}

function sanitizeState(value: unknown): PersistedAppState {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_STATE };
  }

  const candidate = value as Partial<PersistedAppState>;

  return {
    version: STORE_VERSION,
    inboxes: Array.isArray(candidate.inboxes) ? candidate.inboxes.filter(isMailboxRecord) : [],
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
    inboxes: MailboxRecord[],
    selectedInboxId: string | null,
    mailboxNotificationState: Record<string, PersistedMailboxNotificationState>,
    appearanceSettings: AppAppearanceSettings,
  ): void {
    const activeInboxIds = new Set(inboxes.map((inbox) => inbox.id));

    this.state = {
      ...this.state,
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
