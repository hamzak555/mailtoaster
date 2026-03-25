'use client';

import { ChevronLeft, ChevronRight, House, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { MailboxRecord } from '@shared/mailboxes';
import type { MailboxViewState } from '@shared/ipc';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { InboxActionsDropdown } from './inbox-actions-dropdown';
import { MailboxAvatar } from './provider-presentation';

interface MailboxToolbarProps {
  inbox: MailboxRecord | null;
  actionsOpen?: boolean;
  viewState?: MailboxViewState;
  onBack: () => Promise<void>;
  onForward: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onHome: () => Promise<void>;
  onNavigate: (url: string) => Promise<void>;
  onActionsOpenChange?: (open: boolean) => void;
  onRename: () => void;
  onRemove: () => void;
  onOpenSleepSettings: () => void;
  onOpenExternal: () => void;
  onUploadIcon: () => void;
  onResetIcon: () => void;
}

export function MailboxToolbar({
  inbox,
  actionsOpen,
  viewState,
  onBack,
  onForward,
  onRefresh,
  onHome,
  onNavigate,
  onActionsOpenChange,
  onRename,
  onRemove,
  onOpenSleepSettings,
  onOpenExternal,
  onUploadIcon,
  onResetIcon,
}: MailboxToolbarProps) {
  const [draftUrl, setDraftUrl] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (isEditing) {
      return;
    }

    setDraftUrl(viewState?.currentUrl ?? inbox?.targetUrl ?? '');
    setHasError(false);
  }, [inbox?.id, inbox?.targetUrl, isEditing, viewState?.currentUrl]);

  const disabled = !inbox;
  const sleeping = inbox?.sleepState === 'sleeping';

  return (
    <div className="flex h-14 items-center gap-2 border-b border-border/30 bg-background/78 px-3">
      <div className="flex items-center gap-1.5">
        <Button
          className="h-9 w-9 rounded-md"
          disabled={disabled || sleeping || !viewState?.canGoBack}
          size="icon"
          type="button"
          variant="outline"
          onClick={() => void onBack()}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Back</span>
        </Button>
        <Button
          className="h-9 w-9 rounded-md"
          disabled={disabled || sleeping || !viewState?.canGoForward}
          size="icon"
          type="button"
          variant="outline"
          onClick={() => void onForward()}
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Forward</span>
        </Button>
        <Button
          className="h-9 w-9 rounded-md"
          disabled={disabled}
          size="icon"
          type="button"
          variant="outline"
          onClick={() => void onRefresh()}
        >
          <RefreshCw className={cn('h-4 w-4', viewState?.isLoading && 'animate-spin')} />
          <span className="sr-only">Refresh</span>
        </Button>
        <Button
          className="h-9 w-9 rounded-md"
          disabled={disabled}
          size="icon"
          type="button"
          variant="outline"
          onClick={() => void onHome()}
        >
          <House className="h-4 w-4" />
          <span className="sr-only">Home</span>
        </Button>
      </div>

      <form
        className="min-w-0 flex-1"
        onSubmit={(event) => {
          event.preventDefault();

          if (!draftUrl.trim()) {
            return;
          }

          void onNavigate(draftUrl.trim())
            .then(() => {
              setHasError(false);
              setIsEditing(false);
            })
            .catch(() => {
              setHasError(true);
            });
        }}
      >
        <Input
          className={cn(
            'h-9 border-[var(--toolbar-field-border)] bg-[var(--toolbar-field)] text-[var(--toolbar-field-foreground)] shadow-sm placeholder:text-[var(--toolbar-field-placeholder)]',
            hasError && 'border-danger/60 focus-visible:ring-danger',
          )}
          disabled={disabled}
          value={draftUrl}
          onBlur={() => setIsEditing(false)}
          onChange={(event) => {
            setDraftUrl(event.target.value);
            setHasError(false);
          }}
          onFocus={() => setIsEditing(true)}
        />
      </form>

      {inbox ? (
        <div className="hidden items-center gap-2 rounded-lg border border-border/30 bg-card/78 px-2 py-1.5 md:flex">
          <MailboxAvatar
            provider={inbox.provider}
            accountAvatarDataUrl={inbox.accountAvatarDataUrl}
            customIconDataUrl={inbox.customIconDataUrl}
            className="h-8 w-8 min-h-8 min-w-8"
            iconClassName="h-[18px] w-[18px]"
          />
          <div className="min-w-0">
            <div className="max-w-[9rem] truncate text-sm font-medium">{inbox.displayName}</div>
          </div>
          <InboxActionsDropdown
            inbox={inbox}
            open={actionsOpen}
            triggerClassName="app-no-drag h-8 w-8 rounded-md"
            triggerVariant="ghost"
            onOpenChange={onActionsOpenChange}
            onOpenExternal={onOpenExternal}
            onOpenSleepSettings={onOpenSleepSettings}
            onRemove={onRemove}
            onRename={onRename}
            onResetIcon={onResetIcon}
            onUploadIcon={onUploadIcon}
          />
        </div>
      ) : null}
    </div>
  );
}
