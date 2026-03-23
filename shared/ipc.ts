import type { AppAccentThemeId, AppAppearanceSettings } from './appearance';
import type { MailboxProvider, MailboxRecord } from './mailboxes';

export interface MailboxViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MailToasterState {
  inboxes: MailboxRecord[];
  selectedInboxId: string | null;
  viewStates: Record<string, MailboxViewState>;
  appearanceSettings: AppAppearanceSettings;
}

export interface CreateMailboxInput {
  provider: MailboxProvider;
  displayName?: string;
}

export interface MailboxViewState {
  canGoBack: boolean;
  canGoForward: boolean;
  currentUrl: string;
  isLoading: boolean;
}

export type AppUpdatePhase =
  | 'idle'
  | 'unsupported-location'
  | 'checking'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export interface AppUpdateState {
  phase: AppUpdatePhase;
  currentVersion: string;
  availableVersion: string | null;
  progressPercent: number | null;
  detail: string | null;
  canInstall: boolean;
}

export interface MailToasterApi {
  getState: () => Promise<MailToasterState>;
  subscribe: (listener: (state: MailToasterState) => void) => () => void;
  getAppUpdateState: () => Promise<AppUpdateState>;
  subscribeToAppUpdateState: (listener: (state: AppUpdateState) => void) => () => void;
  installDownloadedUpdate: () => Promise<void>;
  setAccentTheme: (accentThemeId: AppAccentThemeId) => Promise<void>;
  setNativeOverlayVisible: (visible: boolean) => Promise<void>;
  createInbox: (input: CreateMailboxInput) => Promise<void>;
  reorderInboxes: (orderedInboxIds: string[]) => Promise<void>;
  setInboxCustomIcon: (id: string, customIconDataUrl: string) => Promise<void>;
  clearInboxCustomIcon: (id: string) => Promise<void>;
  renameInbox: (id: string, displayName: string) => Promise<void>;
  removeInbox: (id: string) => Promise<void>;
  selectInbox: (id: string) => Promise<void>;
  sleepInbox: (id: string) => Promise<void>;
  wakeInbox: (id: string) => Promise<void>;
  openInboxExternal: (id: string) => Promise<void>;
  goBackInbox: (id: string) => Promise<void>;
  goForwardInbox: (id: string) => Promise<void>;
  reloadInbox: (id: string) => Promise<void>;
  goHomeInbox: (id: string) => Promise<void>;
  navigateInbox: (id: string, url: string) => Promise<void>;
  setViewport: (viewport: MailboxViewport) => Promise<void>;
}

export const IPC_CHANNELS = {
  getState: 'mail-toaster:get-state',
  stateChanged: 'mail-toaster:state-changed',
  getAppUpdateState: 'mail-toaster:get-app-update-state',
  appUpdateStateChanged: 'mail-toaster:app-update-state-changed',
  installDownloadedUpdate: 'mail-toaster:install-downloaded-update',
  setAccentTheme: 'mail-toaster:set-accent-theme',
  setNativeOverlayVisible: 'mail-toaster:set-native-overlay-visible',
  createInbox: 'mail-toaster:create-inbox',
  reorderInboxes: 'mail-toaster:reorder-inboxes',
  setInboxCustomIcon: 'mail-toaster:set-inbox-custom-icon',
  clearInboxCustomIcon: 'mail-toaster:clear-inbox-custom-icon',
  renameInbox: 'mail-toaster:rename-inbox',
  removeInbox: 'mail-toaster:remove-inbox',
  selectInbox: 'mail-toaster:select-inbox',
  sleepInbox: 'mail-toaster:sleep-inbox',
  wakeInbox: 'mail-toaster:wake-inbox',
  openInboxExternal: 'mail-toaster:open-inbox-external',
  goBackInbox: 'mail-toaster:go-back-inbox',
  goForwardInbox: 'mail-toaster:go-forward-inbox',
  reloadInbox: 'mail-toaster:reload-inbox',
  goHomeInbox: 'mail-toaster:go-home-inbox',
  navigateInbox: 'mail-toaster:navigate-inbox',
  setViewport: 'mail-toaster:set-viewport',
} as const;
