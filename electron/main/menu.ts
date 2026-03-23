import { Menu, app } from 'electron';

interface AppMenuOptions {
  onCheckForUpdates?: () => void;
}

export function installAppMenu({ onCheckForUpdates }: AppMenuOptions = {}): void {
  const isMac = process.platform === 'darwin';
  const isPackaged = app.isPackaged;
  const updateMenuItems: Electron.MenuItemConstructorOptions[] = onCheckForUpdates
    ? [
        {
          label: 'Check for Updates…',
          click: () => onCheckForUpdates(),
        },
        { type: 'separator' },
      ]
    : [];
  const appMenu: Electron.MenuItemConstructorOptions[] = [
    { role: 'about' },
    { type: 'separator' },
    ...updateMenuItems,
    { role: 'hide' },
    { role: 'hideOthers' },
    { role: 'unhide' },
    { type: 'separator' },
    { role: 'quit' },
  ];
  const editMenu: Electron.MenuItemConstructorOptions[] = [
    { role: 'undo' },
    { role: 'redo' },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { role: 'selectAll' },
  ];
  const viewMenu: Electron.MenuItemConstructorOptions[] = [
    ...(!isPackaged
      ? ([{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }] satisfies
          Electron.MenuItemConstructorOptions[])
      : []),
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];
  const windowMenu: Electron.MenuItemConstructorOptions[] = isMac
    ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
    : [{ role: 'minimize' }, { role: 'close' }];

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: appMenu,
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: editMenu,
    },
    {
      label: 'View',
      submenu: viewMenu,
    },
    {
      label: 'Window',
      submenu: windowMenu,
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
