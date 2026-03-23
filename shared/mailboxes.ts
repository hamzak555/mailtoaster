import type { AppAppearanceSettings } from './appearance';

export const APP_NAME = 'Mail Toaster';

export type MailboxProvider = 'gmail' | 'outlook';
export type MailboxSleepState = 'awake' | 'sleeping';
export type MailboxUnreadState = 'none' | 'dot' | 'count';

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
