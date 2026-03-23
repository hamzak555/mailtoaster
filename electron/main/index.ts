import path from 'node:path';

import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';

import { APP_NAME } from '@shared/mailboxes';
import { IPC_CHANNELS, type AppUpdateState } from '@shared/ipc';

import { MailboxManager } from '../mailboxes/mailbox-manager';
import { AppStore } from '../persistence/app-store';
import { registerIpcHandlers } from './ipc';
import { installAppMenu } from './menu';
import { RendererServer } from './renderer-server';
import { createMainWindow } from '../windows/main-window';

let store: AppStore | null = null;
let mainWindow: BrowserWindow | null = null;
let mailboxManager: MailboxManager | null = null;
let rendererServer: RendererServer | null = null;
let autoUpdateCheckTimer: NodeJS.Timeout | null = null;
let manualUpdateCheckInFlight = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const AUTO_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let appUpdateState: AppUpdateState = {
  phase: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: null,
  progressPercent: null,
  detail: null,
  canInstall: false,
};

if (!hasSingleInstanceLock) {
  app.quit();
}

function isAutoUpdateInstallSupported(): boolean {
  if (!app.isPackaged || process.platform !== 'darwin') {
    return true;
  }

  const executablePath = path.normalize(app.getPath('exe'));
  return executablePath.includes(`${path.sep}Applications${path.sep}`);
}

function getUnsupportedAutoUpdateDetail(): string {
  return 'Automatic updates only install reliably when Mail Toaster is launched from /Applications. Move the app there or reinstall it with the PKG or DMG release.';
}

function emitAppUpdateState(): void {
  appUpdateState = {
    ...appUpdateState,
    currentVersion: app.getVersion(),
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.appUpdateStateChanged, appUpdateState);
  }
}

function setAppUpdateState(nextState: Partial<AppUpdateState>): void {
  appUpdateState = {
    ...appUpdateState,
    ...nextState,
    currentVersion: app.getVersion(),
  };
  emitAppUpdateState();
}

function resetAppUpdateState(): void {
  setAppUpdateState({
    phase: 'idle',
    availableVersion: null,
    progressPercent: null,
    detail: null,
    canInstall: false,
  });
}

function getUpdateVersion(info?: UpdateInfo | null): string | null {
  return info?.version ?? null;
}

function getDownloadDetail(availableVersion: string | null, progress?: ProgressInfo | null): string {
  if (progress && Number.isFinite(progress.percent)) {
    return `Downloading Mail Toaster ${availableVersion ?? ''} (${Math.round(progress.percent)}%).`.trim();
  }

  return availableVersion ? `Downloading Mail Toaster ${availableVersion}.` : 'Downloading the latest Mail Toaster update.';
}

async function openAppWindow(): Promise<void> {
  if (!store) {
    store = new AppStore(app.getPath('userData'));
  }

  const rendererUrl =
    process.env.MAIL_TOASTER_RENDERER_URL ??
    (await (async () => {
      if (!rendererServer) {
        rendererServer = new RendererServer();
      }

      return rendererServer.start();
    })());

  const window = await createMainWindow(store, rendererUrl);
  const manager = new MailboxManager(window, store);

  mainWindow = window;
  mailboxManager = manager;
  manager.initialize();
  emitAppUpdateState();

  window.on('closed', () => {
    manager.dispose();

    if (mainWindow === window) {
      mainWindow = null;
    }

    if (mailboxManager === manager) {
      mailboxManager = null;
    }
  });
}

async function checkForAppUpdates({ interactive = false }: { interactive?: boolean } = {}): Promise<void> {
  if (!isAutoUpdateInstallSupported()) {
    setAppUpdateState({
      phase: 'unsupported-location',
      availableVersion: null,
      progressPercent: null,
      detail: getUnsupportedAutoUpdateDetail(),
      canInstall: false,
    });
    return;
  }

  try {
    setAppUpdateState({
      phase: 'checking',
      availableVersion: null,
      progressPercent: null,
      detail: 'Checking for updates…',
      canInstall: false,
    });
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('Unable to check for Mail Toaster updates.', error);

    if (interactive) {
      setAppUpdateState({
        phase: 'error',
        progressPercent: null,
        canInstall: false,
        detail: error instanceof Error ? error.message : 'Unknown updater error.',
      });
      return;
    }

    resetAppUpdateState();
  }
}

async function showAppDialog(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return await dialog.showMessageBox(mainWindow, options);
  }

  return await dialog.showMessageBox(options);
}

async function manuallyCheckForAppUpdates(): Promise<void> {
  if (!app.isPackaged) {
    await showAppDialog({
      type: 'info',
      buttons: ['OK'],
      title: 'Updates Unavailable in Development',
      message: 'Automatic updates only work in the packaged Mail Toaster app.',
      detail: 'Build and run the packaged app to test release updates.',
    });
    return;
  }

  if (!isAutoUpdateInstallSupported()) {
    setAppUpdateState({
      phase: 'unsupported-location',
      availableVersion: null,
      progressPercent: null,
      detail: getUnsupportedAutoUpdateDetail(),
      canInstall: false,
    });
    return;
  }

  if (manualUpdateCheckInFlight) {
    await showAppDialog({
      type: 'info',
      buttons: ['OK'],
      title: 'Already Checking for Updates',
      message: 'Mail Toaster is already checking for updates.',
    });
    return;
  }

  manualUpdateCheckInFlight = true;

  try {
    const updateStatus = await new Promise<'available' | 'not-available'>((resolve, reject) => {
      const handleUpdateAvailable = () => {
        cleanup();
        resolve('available');
      };
      const handleUpdateNotAvailable = () => {
        cleanup();
        resolve('not-available');
      };
      const handleError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        autoUpdater.removeListener('update-available', handleUpdateAvailable);
        autoUpdater.removeListener('update-not-available', handleUpdateNotAvailable);
        autoUpdater.removeListener('error', handleError);
      };

      autoUpdater.once('update-available', handleUpdateAvailable);
      autoUpdater.once('update-not-available', handleUpdateNotAvailable);
      autoUpdater.once('error', handleError);

      void checkForAppUpdates({ interactive: true }).catch((error) => {
        cleanup();
        reject(error);
      });
    });

    if (updateStatus === 'available') {
      return;
    }

    resetAppUpdateState();
    await showAppDialog({
      type: 'info',
      buttons: ['OK'],
      title: 'Mail Toaster Is Up to Date',
      message: `You are running the latest version (${app.getVersion()}).`,
    });
  } catch (error) {
    console.error('Unable to complete manual Mail Toaster update check.', error);

    setAppUpdateState({
      phase: 'error',
      progressPercent: null,
      canInstall: false,
      detail: error instanceof Error ? error.message : 'Unknown updater error.',
    });
  } finally {
    manualUpdateCheckInFlight = false;
  }
}

async function installDownloadedUpdate(): Promise<void> {
  if (!app.isPackaged) {
    return;
  }

  if (!isAutoUpdateInstallSupported()) {
    setAppUpdateState({
      phase: 'unsupported-location',
      availableVersion: appUpdateState.availableVersion,
      progressPercent: null,
      detail: getUnsupportedAutoUpdateDetail(),
      canInstall: false,
    });
    return;
  }

  if (appUpdateState.phase !== 'downloaded' || !appUpdateState.canInstall) {
    return;
  }

  setAppUpdateState({
    phase: 'installing',
    progressPercent: null,
    detail: `Restarting Mail Toaster to install ${appUpdateState.availableVersion ?? 'the update'}…`,
    canInstall: false,
  });

  setImmediate(() => {
    autoUpdater.quitAndInstall();
  });
}

function setupAutoUpdates(): void {
  if (!app.isPackaged || autoUpdateCheckTimer) {
    return;
  }

  if (!isAutoUpdateInstallSupported()) {
    setAppUpdateState({
      phase: 'unsupported-location',
      availableVersion: null,
      progressPercent: null,
      detail: getUnsupportedAutoUpdateDetail(),
      canInstall: false,
    });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setAppUpdateState({
      phase: 'checking',
      availableVersion: null,
      progressPercent: null,
      detail: 'Checking for updates…',
      canInstall: false,
    });
  });

  autoUpdater.on('update-available', (info) => {
    const availableVersion = getUpdateVersion(info);
    setAppUpdateState({
      phase: 'downloading',
      availableVersion,
      progressPercent: 0,
      detail: getDownloadDetail(availableVersion),
      canInstall: false,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    setAppUpdateState({
      phase: 'downloading',
      progressPercent: Math.round(progress.percent),
      detail: getDownloadDetail(appUpdateState.availableVersion, progress),
      canInstall: false,
    });
  });

  autoUpdater.on('update-not-available', () => {
    resetAppUpdateState();
  });

  autoUpdater.on('error', (error) => {
    console.error('Mail Toaster auto-update failed.', error);
    setAppUpdateState({
      phase: 'error',
      progressPercent: null,
      canInstall: false,
      detail: error instanceof Error ? error.message : 'Unknown updater error.',
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    const availableVersion = getUpdateVersion(info);
    setAppUpdateState({
      phase: 'downloaded',
      availableVersion,
      progressPercent: 100,
      detail: isAutoUpdateInstallSupported()
        ? `Mail Toaster ${availableVersion ?? ''} is ready to install. Restart the app to finish the update.`.trim()
        : getUnsupportedAutoUpdateDetail(),
      canInstall: isAutoUpdateInstallSupported(),
    });
  });

  void checkForAppUpdates();
  autoUpdateCheckTimer = setInterval(() => {
    void checkForAppUpdates();
  }, AUTO_UPDATE_CHECK_INTERVAL_MS);
}

if (hasSingleInstanceLock) {
  app.setName(APP_NAME);
  registerIpcHandlers({
    getManager: () => mailboxManager,
    getAppUpdateState: () => appUpdateState,
    installDownloadedUpdate,
  });

  app.on('second-instance', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }

      mainWindow.show();
      mainWindow.focus();
      return;
    }

    await openAppWindow();
  });

  app.whenReady().then(async () => {
    installAppMenu({
      onCheckForUpdates: () => {
        void manuallyCheckForAppUpdates();
      },
    });
    await openAppWindow();
    setupAutoUpdates();

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await openAppWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    if (autoUpdateCheckTimer) {
      clearInterval(autoUpdateCheckTimer);
      autoUpdateCheckTimer = null;
    }

    void rendererServer?.stop();
  });
}
