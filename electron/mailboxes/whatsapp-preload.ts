const chromeVersion = process.versions.chrome || '141.0.0.0';
const chromeMajorVersion = chromeVersion.split('.')[0] || '141';

interface PlatformIdentity {
  architecture: string;
  bitness: string;
  navigatorPlatform: string;
  platform: string;
  platformVersion: string;
  userAgentPlatform: string;
}

function getPlatformIdentity(): PlatformIdentity {
  switch (process.platform) {
    case 'win32':
      return {
        architecture: process.arch === 'arm64' ? 'arm' : 'x86',
        bitness: '64',
        navigatorPlatform: 'Win32',
        platform: 'Windows',
        platformVersion: '10.0.0',
        userAgentPlatform: 'Windows NT 10.0; Win64; x64',
      };
    case 'linux':
      return {
        architecture: process.arch === 'arm64' ? 'arm' : 'x86',
        bitness: '64',
        navigatorPlatform: 'Linux x86_64',
        platform: 'Linux',
        platformVersion: '0.0.0',
        userAgentPlatform: 'X11; Linux x86_64',
      };
    case 'darwin':
    default:
      return {
        architecture: process.arch === 'arm64' ? 'arm' : 'x86',
        bitness: '64',
        navigatorPlatform: 'MacIntel',
        platform: 'macOS',
        platformVersion: '15.0.0',
        userAgentPlatform: 'Macintosh; Intel Mac OS X 10_15_7',
      };
  }
}

const platformIdentity = getPlatformIdentity();
const userAgent = `Mozilla/5.0 (${platformIdentity.userAgentPlatform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
const appVersion = userAgent.replace(/^Mozilla\//, '');
const brands = [
  { brand: 'Google Chrome', version: chromeMajorVersion },
  { brand: 'Chromium', version: chromeMajorVersion },
  { brand: 'Not_A Brand', version: '24' },
];
const fullVersionList = [
  { brand: 'Google Chrome', version: chromeVersion },
  { brand: 'Chromium', version: chromeVersion },
  { brand: 'Not_A Brand', version: '24.0.0.0' },
];

const userAgentData = {
  brands,
  mobile: false,
  platform: platformIdentity.platform,
  getHighEntropyValues: async (requestedHints: string[] = []) => {
    const values = {
      architecture: platformIdentity.architecture,
      bitness: platformIdentity.bitness,
      brands,
      fullVersionList,
      mobile: false,
      model: '',
      platform: platformIdentity.platform,
      platformVersion: platformIdentity.platformVersion,
      uaFullVersion: chromeVersion,
      wow64: false,
    };

    if (requestedHints.length === 0) {
      return values;
    }

    return Object.fromEntries(
      requestedHints
        .filter((hint) => hint in values)
        .map((hint) => [hint, values[hint as keyof typeof values]]),
    );
  },
  toJSON: () => ({
    brands,
    mobile: false,
    platform: platformIdentity.platform,
  }),
};

function overrideNavigatorProperty(name: string, value: unknown): void {
  try {
    Object.defineProperty(window.Navigator.prototype, name, {
      configurable: true,
      get: () => value,
    });
  } catch {
    // Ignore browsers that refuse the override.
  }
}

overrideNavigatorProperty('userAgent', userAgent);
overrideNavigatorProperty('appVersion', appVersion);
overrideNavigatorProperty('vendor', 'Google Inc.');
overrideNavigatorProperty('platform', platformIdentity.navigatorPlatform);
overrideNavigatorProperty('userAgentData', userAgentData);

const browserWindow = window as Window & { chrome?: { runtime?: Record<string, never> } };

if (!browserWindow.chrome) {
  Object.defineProperty(browserWindow, 'chrome', {
    configurable: true,
    value: { runtime: {} },
  });
}

function getBaseTitle(): string {
  const strippedTitle = document.title.replace(/^\(\d{1,4}\)\s*/, '').replace(/^[*•]\s*/, '').trim();
  return strippedTitle || 'WhatsApp';
}

function getVisibleUnreadBadges(): HTMLElement[] {
  const sidePane = document.querySelector('#pane-side') ?? document.querySelector('#side');

  if (!(sidePane instanceof HTMLElement)) {
    return [];
  }

  return Array.from(sidePane.querySelectorAll<HTMLElement>('span[aria-label], div[aria-label]')).filter((element) => {
    const label = element.getAttribute('aria-label')?.trim() ?? '';

    if (!/\bunread\b/i.test(label) || /\barchived\b/i.test(label)) {
      return false;
    }

    if (element.offsetParent === null) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

function getUnreadCount(): number {
  const unreadBadges = getVisibleUnreadBadges();

  if (unreadBadges.length === 0) {
    return 0;
  }

  let unreadCount = 0;

  for (const badge of unreadBadges) {
    const label = badge.getAttribute('aria-label')?.trim() ?? '';
    const badgeText = badge.textContent?.trim() ?? '';
    const numericMatch = label.match(/(\d{1,4})/) ?? badgeText.match(/(\d{1,4})/);

    unreadCount += numericMatch ? Number.parseInt(numericMatch[1] ?? '1', 10) : 1;
  }

  return Math.min(unreadCount, 999);
}

let unreadTitleTimeout: number | null = null;

function syncUnreadTitle(): void {
  unreadTitleTimeout = null;

  const unreadCount = getUnreadCount();
  const baseTitle = getBaseTitle();
  const nextTitle = unreadCount > 0 ? `(${unreadCount}) ${baseTitle}` : baseTitle;

  if (document.title !== nextTitle) {
    document.title = nextTitle;
  }
}

function scheduleUnreadTitleSync(): void {
  if (unreadTitleTimeout !== null) {
    return;
  }

  unreadTitleTimeout = window.setTimeout(() => {
    syncUnreadTitle();
  }, 0);
}

function startUnreadObserver(): void {
  scheduleUnreadTitleSync();

  const observer = new MutationObserver(() => {
    scheduleUnreadTitleSync();
  });

  if (document.body) {
    observer.observe(document.body, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  window.setInterval(() => {
    scheduleUnreadTitleSync();
  }, 5000);
}

if (document.readyState === 'loading') {
  window.addEventListener(
    'DOMContentLoaded',
    () => {
      startUnreadObserver();
    },
    { once: true },
  );
} else {
  startUnreadObserver();
}
