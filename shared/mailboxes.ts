import type { AppAppearanceSettings } from './appearance';

export const APP_NAME = 'Mail Toaster';
export const DEFAULT_MAILBOX_GROUP_ID = 'mailbox-group-inboxes';
export const DEFAULT_MAILBOX_GROUP_NAME = 'Inboxes';
export const DEFAULT_MAILBOX_GROUP_ICON_ID = 'folders';
export const SYSTEM_MAILBOX_GROUP_ICON_ID = 'inbox';
export const DEFAULT_MAILBOX_GROUP_EMOJI = '🗂️';
export const SYSTEM_MAILBOX_GROUP_EMOJI = '📥';

export const MAILBOX_PROVIDERS = ['gmail', 'outlook', 'protonmail', 'whatsapp'] as const;
export const MAILBOX_GROUP_ICON_IDS = [
  'folders',
  'inbox',
  'briefcase',
  'building-2',
  'users',
  'message-circle',
  'shopping-bag',
  'receipt-text',
  'megaphone',
  'headphones',
  'star',
  'book-open',
  'archive',
  'badge-dollar-sign',
  'bell',
  'book-marked',
  'calendar',
  'camera',
  'chart-column',
  'chart-pie',
  'clipboard-list',
  'code-2',
  'cog',
  'file-text',
  'flag',
  'globe',
  'heart',
  'home',
  'image',
  'layout-grid',
  'lightbulb',
  'map-pinned',
  'monitor',
  'package',
  'rocket',
  'shield',
  'store',
  'tag',
  'trending-up',
  'wrench',
] as const;
export type MailboxProvider = (typeof MAILBOX_PROVIDERS)[number];
export type MailboxGroupIconId = (typeof MAILBOX_GROUP_ICON_IDS)[number];
export type MailboxSleepState = 'awake' | 'sleeping';
export type MailboxSleepMode = 'manual' | 'inactivity';
export type MailboxUnreadState = 'none' | 'dot' | 'count';
export const AUTO_SLEEP_MINUTES_OPTIONS = [15, 30, 60, 120] as const;
export type MailboxAutoSleepMinutes = (typeof AUTO_SLEEP_MINUTES_OPTIONS)[number];

export interface MailboxGroup {
  id: string;
  name: string;
  icon: MailboxGroupIconId;
  emoji: string | null;
  sortOrder: number;
  collapsed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MailboxRecord {
  id: string;
  provider: MailboxProvider;
  displayName: string;
  targetUrl: string;
  resumeUrl: string | null;
  icon: MailboxProvider;
  accountAvatarDataUrl: string | null;
  customIconDataUrl: string | null;
  partition: string;
  groupId: string;
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
  groups: MailboxGroup[];
  inboxes: MailboxRecord[];
  selectedInboxId: string | null;
  windowBounds: PersistedWindowBounds | null;
  mailboxNotificationState: Record<string, PersistedMailboxNotificationState>;
  appearanceSettings: AppAppearanceSettings;
}

export function isMailboxAutoSleepMinutes(value: unknown): value is MailboxAutoSleepMinutes {
  return typeof value === 'number' && AUTO_SLEEP_MINUTES_OPTIONS.some((minutes) => minutes === value);
}

export function isMailboxProvider(value: unknown): value is MailboxProvider {
  return typeof value === 'string' && MAILBOX_PROVIDERS.some((provider) => provider === value);
}

export function isMailboxGroupIconId(value: unknown): value is MailboxGroupIconId {
  return typeof value === 'string' && MAILBOX_GROUP_ICON_IDS.some((iconId) => iconId === value);
}

export function getDefaultMailboxGroupIconId(groupId?: string): MailboxGroupIconId {
  return groupId === DEFAULT_MAILBOX_GROUP_ID ? SYSTEM_MAILBOX_GROUP_ICON_ID : DEFAULT_MAILBOX_GROUP_ICON_ID;
}

export function normalizeMailboxGroupEmoji(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

const MAILBOX_GROUP_ICON_EMOJI_FALLBACKS: Record<MailboxGroupIconId, string> = {
  folders: '🗂️',
  inbox: '📥',
  briefcase: '💼',
  'building-2': '🏢',
  users: '👥',
  'message-circle': '💬',
  'shopping-bag': '🛍️',
  'receipt-text': '🧾',
  megaphone: '📣',
  headphones: '🎧',
  star: '⭐',
  'book-open': '📚',
  archive: '🗄️',
  'badge-dollar-sign': '💰',
  bell: '🔔',
  'book-marked': '📘',
  calendar: '📅',
  camera: '📸',
  'chart-column': '📊',
  'chart-pie': '📈',
  'clipboard-list': '📋',
  'code-2': '💻',
  cog: '⚙️',
  'file-text': '📄',
  flag: '🚩',
  globe: '🌍',
  heart: '❤️',
  home: '🏠',
  image: '🖼️',
  'layout-grid': '🔲',
  lightbulb: '💡',
  'map-pinned': '📍',
  monitor: '🖥️',
  package: '📦',
  rocket: '🚀',
  shield: '🛡️',
  store: '🏪',
  tag: '🏷️',
  'trending-up': '📈',
  wrench: '🔧',
};

export function getMailboxGroupEmojiFallback(groupId?: string, iconId?: MailboxGroupIconId): string {
  if (groupId === DEFAULT_MAILBOX_GROUP_ID) {
    return SYSTEM_MAILBOX_GROUP_EMOJI;
  }

  if (iconId && isMailboxGroupIconId(iconId)) {
    return MAILBOX_GROUP_ICON_EMOJI_FALLBACKS[iconId];
  }

  return DEFAULT_MAILBOX_GROUP_EMOJI;
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

export function compareMailboxGroups(left: MailboxGroup, right: MailboxGroup): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.createdAt.localeCompare(right.createdAt);
}

export function getProviderLabel(provider: MailboxProvider): string {
  switch (provider) {
    case 'gmail':
      return 'Gmail';
    case 'outlook':
      return 'Outlook';
    case 'protonmail':
      return 'Protonmail';
    case 'whatsapp':
      return 'WhatsApp';
  }
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
