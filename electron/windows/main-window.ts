import path from 'node:path';

import { BrowserWindow, screen, type Rectangle } from 'electron';

import { APP_NAME } from '@shared/mailboxes';

import { AppStore } from '../persistence/app-store';

const DEFAULT_WINDOW_SIZE = { width: 1480, height: 940 };

function intersectsVisibleDisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;

    return (
      bounds.x < area.x + area.width &&
      bounds.x + bounds.width > area.x &&
      bounds.y < area.y + area.height &&
      bounds.y + bounds.height > area.y
    );
  });
}

function getInitialWindowBounds(store: AppStore): Rectangle {
  const savedBounds = store.getState().windowBounds;

  if (
    savedBounds &&
    typeof savedBounds.width === 'number' &&
    typeof savedBounds.height === 'number' &&
    typeof savedBounds.x === 'number' &&
    typeof savedBounds.y === 'number'
  ) {
    const candidateBounds: Rectangle = {
      x: savedBounds.x,
      y: savedBounds.y,
      width: savedBounds.width,
      height: savedBounds.height,
    };

    if (intersectsVisibleDisplay(candidateBounds)) {
      return candidateBounds;
    }
  }

  const area = screen.getPrimaryDisplay().workArea;

  return {
    x: area.x + Math.max(24, Math.round((area.width - DEFAULT_WINDOW_SIZE.width) / 2)),
    y: area.y + Math.max(32, Math.round((area.height - DEFAULT_WINDOW_SIZE.height) / 2)),
    width: DEFAULT_WINDOW_SIZE.width,
    height: DEFAULT_WINDOW_SIZE.height,
  };
}

export async function createMainWindow(store: AppStore, rendererUrl: string): Promise<BrowserWindow> {
  const initialBounds = getInitialWindowBounds(store);

  const window = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    minWidth: 1140,
    minHeight: 760,
    show: false,
    title: APP_NAME,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 12 },
    backgroundColor: '#F6EFE6',
    vibrancy: 'sidebar',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  let didShowWindow = false;
  const showWindow = (): void => {
    if (didShowWindow || window.isDestroyed()) {
      return;
    }

    didShowWindow = true;
    window.show();
    window.focus();
  };

  let persistTimer: NodeJS.Timeout | undefined;

  const persistWindowBounds = (): void => {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      if (window.isDestroyed()) {
        return;
      }

      const bounds = window.getBounds();
      store.saveWindowBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      });
    }, 180);
  };

  window.on('resize', persistWindowBounds);
  window.on('move', persistWindowBounds);
  window.on('close', persistWindowBounds);

  window.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    window.setTitle(APP_NAME);
  });

  window.once('ready-to-show', showWindow);

  await window.loadURL(rendererUrl);

  showWindow();

  return window;
}
