import type { MailboxProvider } from '@shared/mailboxes';

interface ProviderConfig {
  defaultTargetUrl: string;
  allowedHosts: string[];
  allowedAvatarHosts: string[];
  resumeHosts: string[];
}

const PROVIDER_CONFIG: Record<MailboxProvider, ProviderConfig> = {
  gmail: {
    defaultTargetUrl: 'https://mail.google.com/mail/u/0/#inbox',
    allowedHosts: ['mail.google.com', 'accounts.google.com', 'myaccount.google.com'],
    allowedAvatarHosts: [
      'mail.google.com',
      'accounts.google.com',
      'myaccount.google.com',
      'googleusercontent.com',
      'gstatic.com',
      'googleapis.com',
    ],
    resumeHosts: ['mail.google.com'],
  },
  outlook: {
    defaultTargetUrl: 'https://outlook.office.com/mail/',
    allowedHosts: [
      'outlook.office.com',
      'outlook.office365.com',
      'outlook.live.com',
      'login.live.com',
      'login.microsoftonline.com',
      'office.com',
      'www.office.com',
    ],
    allowedAvatarHosts: [
      'outlook.office.com',
      'outlook.office365.com',
      'outlook.live.com',
      'office.com',
      'www.office.com',
      'live.com',
      'microsoft.com',
      'microsoftonline.com',
      'office365.com',
      'sharepoint.com',
    ],
    resumeHosts: ['outlook.office.com', 'outlook.office365.com', 'outlook.live.com'],
  },
  protonmail: {
    defaultTargetUrl: 'https://mail.proton.me/u/0/inbox',
    allowedHosts: ['mail.proton.me', 'account.proton.me', 'proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me'],
    allowedAvatarHosts: ['mail.proton.me', 'account.proton.me', 'proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me'],
    resumeHosts: ['mail.proton.me'],
  },
  whatsapp: {
    defaultTargetUrl: 'https://web.whatsapp.com/',
    allowedHosts: ['web.whatsapp.com'],
    allowedAvatarHosts: ['web.whatsapp.com', 'mmg.whatsapp.net', 'pps.whatsapp.net', 'static.whatsapp.net'],
    resumeHosts: ['web.whatsapp.com'],
  },
};

function isAllowedHost(hostname: string, allowedHosts: string[]): boolean {
  return allowedHosts.some((allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`));
}

export function getDefaultTargetUrl(provider: MailboxProvider): string {
  return PROVIDER_CONFIG[provider].defaultTargetUrl;
}

export function isAllowedMailboxUrl(provider: MailboxProvider, candidateUrl: string): boolean {
  try {
    const parsedUrl = new URL(candidateUrl);

    if (!['https:', 'about:'].includes(parsedUrl.protocol)) {
      return false;
    }

    if (parsedUrl.protocol === 'about:') {
      return parsedUrl.href === 'about:blank';
    }

    return isAllowedHost(parsedUrl.hostname, PROVIDER_CONFIG[provider].allowedHosts);
  } catch {
    return false;
  }
}

export function isAllowedAvatarAssetUrl(provider: MailboxProvider, candidateUrl: string): boolean {
  try {
    const parsedUrl = new URL(candidateUrl);

    return parsedUrl.protocol === 'https:' && isAllowedHost(parsedUrl.hostname, PROVIDER_CONFIG[provider].allowedAvatarHosts);
  } catch {
    return false;
  }
}

export function isResumableMailboxUrl(provider: MailboxProvider, candidateUrl: string): boolean {
  try {
    const parsedUrl = new URL(candidateUrl);

    return parsedUrl.protocol === 'https:' && isAllowedHost(parsedUrl.hostname, PROVIDER_CONFIG[provider].resumeHosts);
  } catch {
    return false;
  }
}
