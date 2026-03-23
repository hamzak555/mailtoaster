import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';

import { APP_NAME } from '@shared/mailboxes';

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
let updatePromptInFlight = false;
let manualUpdateCheckInFlight = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const AUTO_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

if (!hasSingleInstanceLock) {
  app.quit();
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

async function checkForAppUpdates(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('Unable to check for Mail Toaster updates.', error);
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

      void autoUpdater.checkForUpdates().catch((error) => {
        cleanup();
        reject(error);
      });
    });

    if (updateStatus === 'available') {
      await showAppDialog({
        type: 'info',
        buttons: ['OK'],
        title: 'Update Found',
        message: 'A new version of Mail Toaster is available.',
        detail: 'It is downloading in the background. You will be prompted to restart once it is ready.',
      });
      return;
    }

    await showAppDialog({
      type: 'info',
      buttons: ['OK'],
      title: 'Mail Toaster Is Up to Date',
      message: `You are running the latest version (${app.getVersion()}).`,
    });
  } catch (error) {
    console.error('Unable to complete manual Mail Toaster update check.', error);

    await showAppDialog({
      type: 'error',
      buttons: ['OK'],
      title: 'Update Check Failed',
      message: 'Mail Toaster could not check for updates.',
      detail: error instanceof Error ? error.message : 'Unknown updater error.',
    });
  } finally {
    manualUpdateCheckInFlight = false;
  }
}

function setupAutoUpdates(): void {
  if (!app.isPackaged || autoUpdateCheckTimer) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (error) => {
    console.error('Mail Toaster auto-update failed.', error);
  });

  autoUpdater.on('update-downloaded', async () => {
    if (updatePromptInFlight) {
      return;
    }

    updatePromptInFlight = true;

    try {
      const result = mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showMessageBox(mainWindow, {
            type: 'info',
            buttons: ['Restart', 'Later'],
            defaultId: 0,
            cancelId: 1,
            title: 'Mail Toaster Update Ready',
            message: 'A new version of Mail Toaster has been downloaded.',
            detail: 'Restart the app to install the update.',
          })
        : await dialog.showMessageBox({
            type: 'info',
            buttons: ['Restart', 'Later'],
            defaultId: 0,
            cancelId: 1,
            title: 'Mail Toaster Update Ready',
            message: 'A new version of Mail Toaster has been downloaded.',
            detail: 'Restart the app to install the update.',
          });

      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    } finally {
      updatePromptInFlight = false;
    }
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
