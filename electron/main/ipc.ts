import { ipcMain } from 'electron';

import { IPC_CHANNELS, type AppUpdateState, type CreateMailboxInput, type MailboxViewport } from '@shared/ipc';

import { MailboxManager } from '../mailboxes/mailbox-manager';

interface ManagerProvider {
  getManager: () => MailboxManager | null;
  getAppUpdateState: () => AppUpdateState;
  installDownloadedUpdate: () => Promise<void>;
}

function resolveManager(provider: ManagerProvider): MailboxManager {
  const manager = provider.getManager();

  if (!manager) {
    throw new Error('Mail Toaster window is not ready.');
  }

  return manager;
}

export function registerIpcHandlers(provider: ManagerProvider): void {
  ipcMain.handle(IPC_CHANNELS.getState, () => resolveManager(provider).getState());
  ipcMain.handle(IPC_CHANNELS.getAppUpdateState, () => provider.getAppUpdateState());
  ipcMain.handle(IPC_CHANNELS.installDownloadedUpdate, () => provider.installDownloadedUpdate());
  ipcMain.handle(IPC_CHANNELS.createInbox, (_event, input: CreateMailboxInput) => resolveManager(provider).createInbox(input));
  ipcMain.handle(IPC_CHANNELS.reorderInboxes, (_event, orderedInboxIds: string[]) =>
    resolveManager(provider).reorderInboxes(orderedInboxIds),
  );
  ipcMain.handle(IPC_CHANNELS.setInboxCustomIcon, (_event, id: string, customIconDataUrl: string) =>
    resolveManager(provider).setInboxCustomIcon(id, customIconDataUrl),
  );
  ipcMain.handle(IPC_CHANNELS.clearInboxCustomIcon, (_event, id: string) =>
    resolveManager(provider).clearInboxCustomIcon(id),
  );
  ipcMain.handle(IPC_CHANNELS.renameInbox, (_event, id: string, displayName: string) =>
    resolveManager(provider).renameInbox(id, displayName),
  );
  ipcMain.handle(IPC_CHANNELS.removeInbox, (_event, id: string) => resolveManager(provider).removeInbox(id));
  ipcMain.handle(IPC_CHANNELS.selectInbox, (_event, id: string) => resolveManager(provider).selectInbox(id));
  ipcMain.handle(IPC_CHANNELS.sleepInbox, (_event, id: string) => resolveManager(provider).sleepInbox(id));
  ipcMain.handle(IPC_CHANNELS.wakeInbox, (_event, id: string) => resolveManager(provider).wakeInbox(id));
  ipcMain.handle(IPC_CHANNELS.openInboxExternal, (_event, id: string) => resolveManager(provider).openInboxExternal(id));
  ipcMain.handle(IPC_CHANNELS.goBackInbox, (_event, id: string) => resolveManager(provider).goBackInbox(id));
  ipcMain.handle(IPC_CHANNELS.goForwardInbox, (_event, id: string) => resolveManager(provider).goForwardInbox(id));
  ipcMain.handle(IPC_CHANNELS.reloadInbox, (_event, id: string) => resolveManager(provider).reloadInbox(id));
  ipcMain.handle(IPC_CHANNELS.goHomeInbox, (_event, id: string) => resolveManager(provider).goHomeInbox(id));
  ipcMain.handle(IPC_CHANNELS.navigateInbox, (_event, id: string, url: string) =>
    resolveManager(provider).navigateInbox(id, url),
  );
  ipcMain.handle(IPC_CHANNELS.setViewport, (_event, viewport: MailboxViewport) => resolveManager(provider).setViewport(viewport));
}
