'use client';

import { useEffect, useState } from 'react';

import type { MailboxProvider } from '@shared/mailboxes';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { ProviderPill } from './provider-presentation';

interface AddInboxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { provider: MailboxProvider; displayName?: string }) => Promise<void>;
}

export function AddInboxDialog({ open, onOpenChange, onCreate }: AddInboxDialogProps) {
  const [provider, setProvider] = useState<MailboxProvider>('gmail');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (!open) {
      setProvider('gmail');
      setDisplayName('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      await onCreate({
        provider,
        displayName: displayName.trim() || undefined,
      });

      onOpenChange(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to add inbox.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Inbox</DialogTitle>
          <DialogDescription>Choose a provider.</DialogDescription>
        </DialogHeader>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <button
              className="w-full rounded-2xl text-left outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
              onClick={() => setProvider('gmail')}
            >
              <ProviderPill provider="gmail" active={provider === 'gmail'} />
            </button>
            <button
              className="w-full rounded-2xl text-left outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
              onClick={() => setProvider('outlook')}
            >
              <ProviderPill provider="outlook" active={provider === 'outlook'} />
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground" htmlFor="displayName">
              Name
            </label>
            <Input
              id="displayName"
              autoFocus
              autoComplete="off"
              placeholder={provider === 'gmail' ? 'Gmail' : 'Outlook'}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              Add Inbox
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
