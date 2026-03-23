'use client';

import { useEffect, useState } from 'react';

import type { MailboxProvider, MailboxRecord } from '@shared/mailboxes';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { ProviderPill } from './provider-presentation';

export type SidebarPanelState =
  | { type: 'add' }
  | { type: 'rename'; inbox: MailboxRecord }
  | { type: 'remove'; inbox: MailboxRecord };

interface InboxSidebarPanelProps {
  panel: SidebarPanelState | null;
  onClose: () => void;
  onCreate: (input: { provider: MailboxProvider; displayName?: string }) => Promise<void>;
  onRename: (id: string, displayName: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function InboxSidebarPanel({ panel, onClose, onCreate, onRename, onRemove }: InboxSidebarPanelProps) {
  const [provider, setProvider] = useState<MailboxProvider>('gmail');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const panelKey = !panel ? 'closed' : panel.type === 'add' ? 'add' : `${panel.type}:${panel.inbox.id}`;

  useEffect(() => {
    if (!panel) {
      setProvider('gmail');
      setDisplayName('');
      setError(null);
      setIsPending(false);
      return;
    }

    if (panel.type === 'rename') {
      setDisplayName(panel.inbox.displayName);
    } else {
      setDisplayName('');
    }

    if (panel.type === 'add') {
      setProvider('gmail');
    } else {
      setProvider(panel.inbox.provider);
    }

    setError(null);
    setIsPending(false);
  }, [panelKey]);

  if (!panel) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      if (panel.type === 'add') {
        await onCreate({
          provider,
          displayName: displayName.trim() || undefined,
        });
      } else if (panel.type === 'rename') {
        await onRename(panel.inbox.id, displayName);
      } else {
        await onRemove(panel.inbox.id);
      }

      onClose();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to save.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <section className="rounded-xl border border-border/30 bg-background/80 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold tracking-tight">
          {panel.type === 'add' ? 'Add Inbox' : panel.type === 'rename' ? 'Rename' : 'Remove'}
        </div>
        <Button className="h-8 rounded-md px-2.5" type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      {panel.type === 'remove' ? (
        <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
          <div className="rounded-lg border border-border/30 bg-card/74 px-3 py-2.5 text-sm">
            <div className="truncate font-medium">{panel.inbox.displayName}</div>
            <div className="mt-0.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">{panel.inbox.provider}</div>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex gap-2">
            <Button className="flex-1" type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1" type="submit" variant="danger" disabled={isPending}>
              Remove
            </Button>
          </div>
        </form>
      ) : (
        <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
          {panel.type === 'add' ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                aria-pressed={provider === 'gmail'}
                className="h-20 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
                onClick={() => setProvider('gmail')}
              >
                <ProviderPill provider="gmail" active={provider === 'gmail'} compact className="h-full" />
              </button>
              <button
                aria-pressed={provider === 'outlook'}
                className="h-20 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
                onClick={() => setProvider('outlook')}
              >
                <ProviderPill provider="outlook" active={provider === 'outlook'} compact className="h-full" />
              </button>
            </div>
          ) : null}

          <Input
            autoFocus
            autoComplete="off"
            placeholder={panel.type === 'add' ? (provider === 'gmail' ? 'Gmail' : 'Outlook') : 'Inbox name'}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex gap-2">
            <Button className="flex-1" type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1" type="submit" disabled={isPending}>
              {panel.type === 'add' ? 'Add Inbox' : 'Save'}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
