import { getProviderLabel, type MailboxProvider } from '@shared/mailboxes';

import { GmailIcon } from '@/components/icons/gmail-icon';
import { OutlookIcon } from '@/components/icons/outlook-icon';
import { ProtonmailIcon } from '@/components/icons/protonmail-icon';
import { WhatsappIcon } from '@/components/icons/whatsapp-icon';
import { cn } from '@/lib/utils';

export function ProviderIcon({ provider, className }: { provider: MailboxProvider; className?: string }) {
  switch (provider) {
    case 'gmail':
      return <GmailIcon className={className} />;
    case 'outlook':
      return <OutlookIcon className={className} />;
    case 'protonmail':
      return <ProtonmailIcon className={className} />;
    case 'whatsapp':
      return <WhatsappIcon className={className} />;
  }
}

export function MailboxAvatar({
  provider,
  accountAvatarDataUrl,
  customIconDataUrl,
  className,
  iconClassName,
}: {
  provider: MailboxProvider;
  accountAvatarDataUrl?: string | null;
  customIconDataUrl?: string | null;
  className?: string;
  iconClassName?: string;
}) {
  const displayImage = customIconDataUrl ?? accountAvatarDataUrl;

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-primary/30 shadow-[0_0_0_1px_hsl(var(--background)/0.55)]',
        displayImage ? 'bg-card/80' : 'bg-secondary',
        className,
      )}
    >
      {displayImage ? (
        <img alt="" src={displayImage} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <ProviderIcon provider={provider} className={cn('h-5 w-5', iconClassName)} />
      )}
    </div>
  );
}

export function ProviderPill({
  provider,
  active,
  compact = false,
  className,
}: {
  provider: MailboxProvider;
  active: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center rounded-xl border transition',
        compact ? 'justify-center px-0 py-0' : 'gap-3 px-4 py-3',
        active ? 'border-primary/35 bg-primary/8 shadow-soft' : 'border-border bg-card/60 hover:bg-card',
        className,
      )}
    >
      <MailboxAvatar provider={provider} className={cn('shrink-0', compact ? 'h-11 w-11' : 'h-10 w-10')} />
      {compact ? <span className="sr-only">{getProviderLabel(provider)}</span> : <span className="text-sm font-medium">{getProviderLabel(provider)}</span>}
    </div>
  );
}
