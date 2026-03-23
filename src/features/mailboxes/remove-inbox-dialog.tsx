'use client';

import type { MailboxRecord } from '@shared/mailboxes';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface RemoveInboxDialogProps {
  inbox: MailboxRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: (id: string) => Promise<void>;
}

export function RemoveInboxDialog({ inbox, open, onOpenChange, onRemove }: RemoveInboxDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Inbox</AlertDialogTitle>
          <AlertDialogDescription>This removes it from Mail Toaster.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (inbox) {
                void onRemove(inbox.id);
              }
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
