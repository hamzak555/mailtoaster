'use client';

import { useEffect, useState, useTransition } from 'react';

import type { MailboxRecord } from '@shared/mailboxes';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface RenameInboxDialogProps {
  inbox: MailboxRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (id: string, displayName: string) => Promise<void>;
}

export function RenameInboxDialog({ inbox, open, onOpenChange, onRename }: RenameInboxDialogProps) {
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open && inbox) {
      setDisplayName(inbox.displayName);
      setError(null);
    }
  }, [open, inbox]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!inbox) {
      return;
    }

    setError(null);

    try {
      await onRename(inbox.id, displayName);
      startTransition(() => {
        onOpenChange(false);
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to rename inbox.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename</DialogTitle>
        </DialogHeader>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoFocus autoComplete="off" />
          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
