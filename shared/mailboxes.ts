import type { AppAppearanceSettings } from './appearance';

export const APP_NAME = 'Mail Toaster';

export type MailboxProvider = 'gmail' | 'outlook';
export type MailboxSleepState = 'awake' | 'sleeping';
export type MailboxSleepMode = 'manual' | 'inactivity';
export type MailboxUnreadState = 'none' | 'dot' | 'count';
export const AUTO_SLEEP_MINUTES_OPTIONS = [15, 30, 60, 120] as const;
export type MailboxAutoSleepMinutes = (typeof AUTO_SLEEP_MINUTES_OPTIONS)[number];

export interface MailboxRecord {
  id: string;
  provider: MailboxProvider;
  displayName: string;
  targetUrl: string;
  icon: MailboxProvider;
  accountAvatarDataUrl: string | null;
  customIconDataUrl: string | null;
  partition: string;
  sleepState: MailboxSleepState;
  sleepMode: MailboxSleepMode;
  sleepAfterMinutes: MailboxAutoSleepMinutes | null;
  unreadCount: number | null;
  unreadState: MailboxUnreadState;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedWindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface PersistedMailboxNotificationState {
  lastUnreadNotificationSignature: string | null;
}

export interface PersistedAppState {
  version: number;
  inboxes: MailboxRecord[];
  selectedInboxId: string | null;
  windowBounds: PersistedWindowBounds | null;
  mailboxNotificationState: Record<string, PersistedMailboxNotificationState>;
  appearanceSettings: AppAppearanceSettings;
}

export function isMailboxAutoSleepMinutes(value: unknown): value is MailboxAutoSleepMinutes {
  return typeof value === 'number' && AUTO_SLEEP_MINUTES_OPTIONS.some((minutes) => minutes === value);
}

export function formatAutoSleepLabel(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }

  return `${minutes} min`;
}

export function compareMailboxes(left: MailboxRecord, right: MailboxRecord): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.createdAt.localeCompare(right.createdAt);
}

export function getProviderLabel(provider: MailboxProvider): string {
  return provider === 'gmail' ? 'Gmail' : 'Outlook';
}

export function getDefaultDisplayName(provider: MailboxProvider, existingCount: number): string {
  const label = getProviderLabel(provider);

  return existingCount > 0 ? `${label} ${existingCount + 1}` : label;
}

export function getAggregateUnreadCount(inboxes: Pick<MailboxRecord, 'unreadState' | 'unreadCount'>[]): number {
  return inboxes.reduce((sum, inbox) => {
    if (inbox.unreadState === 'count' && inbox.unreadCount && inbox.unreadCount > 0) {
      return sum + inbox.unreadCount;
    }

    return sum;
  }, 0);
}

export function hasAggregateUnreadDot(inboxes: Pick<MailboxRecord, 'unreadState'>[]): boolean {
  return inboxes.some((inbox) => inbox.unreadState === 'dot');
}
