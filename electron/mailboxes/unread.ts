import type { MailboxProvider, MailboxUnreadState } from '@shared/mailboxes';

export interface ParsedUnreadState {
  unreadState: MailboxUnreadState;
  unreadCount: number | null;
}

const COUNT_PATTERNS = [/^\((\d{1,4})\)/, /\((\d{1,4})\)\s*[-|]/, /\bInbox\s*\((\d{1,4})\)/i];

export function parseUnreadFromTitle(provider: MailboxProvider, title: string): ParsedUnreadState {
  for (const pattern of COUNT_PATTERNS) {
    const match = title.match(pattern);

    if (match) {
      return {
        unreadState: 'count',
        unreadCount: Math.min(Number.parseInt(match[1] ?? '0', 10), 999),
      };
    }
  }

  if (provider === 'gmail' && (/^[*•]/.test(title) || /\bunread\b/i.test(title))) {
    return { unreadState: 'dot', unreadCount: null };
  }

  if (provider === 'outlook' && (/^[*•]/.test(title) || /\bunread\b/i.test(title))) {
    return { unreadState: 'dot', unreadCount: null };
  }

  if (provider === 'protonmail' && (/^[*•]/.test(title) || /\bunread\b/i.test(title))) {
    return { unreadState: 'dot', unreadCount: null };
  }

  return { unreadState: 'none', unreadCount: null };
}
