import { contextBridge, ipcRenderer } from 'electron';

import {
  IPC_CHANNELS,
  type AppUpdateState,
  type CreateMailboxInput,
  type MailToasterApi,
  type MailToasterState,
  type MailboxViewport,
} from '@shared/ipc';
import type { AppAccentThemeId } from '@shared/appearance';

const api: MailToasterApi = {
  getState: () => ipcRenderer.invoke(IPC_CHANNELS.getState) as Promise<MailToasterState>,
  subscribe: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, nextState: MailToasterState): void => {
      listener(nextState);
    };

    ipcRenderer.on(IPC_CHANNELS.stateChanged, wrappedListener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.stateChanged, wrappedListener);
    };
  },
  getAppUpdateState: () => ipcRenderer.invoke(IPC_CHANNELS.getAppUpdateState) as Promise<AppUpdateState>,
  subscribeToAppUpdateState: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, nextState: AppUpdateState): void => {
      listener(nextState);
    };

    ipcRenderer.on(IPC_CHANNELS.appUpdateStateChanged, wrappedListener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.appUpdateStateChanged, wrappedListener);
    };
  },
  installDownloadedUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.installDownloadedUpdate) as Promise<void>,
  setAccentTheme: (accentThemeId: AppAccentThemeId) =>
    ipcRenderer.invoke(IPC_CHANNELS.setAccentTheme, accentThemeId) as Promise<void>,
  setNativeOverlayVisible: (visible: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.setNativeOverlayVisible, visible) as Promise<void>,
  createInbox: (input: CreateMailboxInput) => ipcRenderer.invoke(IPC_CHANNELS.createInbox, input) as Promise<void>,
  reorderInboxes: (orderedInboxIds: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.reorderInboxes, orderedInboxIds) as Promise<void>,
  setInboxCustomIcon: (id: string, customIconDataUrl: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.setInboxCustomIcon, id, customIconDataUrl) as Promise<void>,
  clearInboxCustomIcon: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.clearInboxCustomIcon, id) as Promise<void>,
  renameInbox: (id: string, displayName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.renameInbox, id, displayName) as Promise<void>,
  removeInbox: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.removeInbox, id) as Promise<void>,
  selectInbox: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.selectInbox, id) as Promise<void>,
  sleepInbox: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.sleepInbox, id) as Promise<void>,
  wakeInbox: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.wakeInbox, id) as Promise<void>,
  openInboxExternal: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.openInboxExternal, id) as Promise<void>,
  goBackInbox: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.goBackInbox, id) as Promise<void>,
  goForwardInbox: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.goForwardInbox, id) as Promise<void>,
  reloadInbox: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.reloadInbox, id) as Promise<void>,
  goHomeInbox: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.goHomeInbox, id) as Promise<void>,
  navigateInbox: (id: string, url: string) => ipcRenderer.invoke(IPC_CHANNELS.navigateInbox, id, url) as Promise<void>,
  setViewport: (viewport: MailboxViewport) => ipcRenderer.invoke(IPC_CHANNELS.setViewport, viewport) as Promise<void>,
};

contextBridge.exposeInMainWorld('mailToaster', api);
