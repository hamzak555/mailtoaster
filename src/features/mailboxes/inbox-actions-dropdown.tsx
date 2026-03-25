'use client';

import { ExternalLink, ImagePlus, MoonStar, Pencil, RotateCcw, Settings2, Trash2 } from 'lucide-react';

import type { MailboxRecord } from '@shared/mailboxes';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface InboxActionsDropdownProps {
  inbox: MailboxRecord;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onRename: () => void;
  onRemove: () => void;
  onOpenSleepSettings: () => void;
  onOpenExternal: () => void;
  onUploadIcon: () => void;
  onResetIcon: () => void;
  triggerClassName?: string;
  triggerVariant?: 'ghost' | 'outline';
}

export function InboxActionsDropdown({
  inbox,
  open,
  onOpenChange,
  onRename,
  onRemove,
  onOpenSleepSettings,
  onOpenExternal,
  onUploadIcon,
  onResetIcon,
  triggerClassName,
  triggerVariant = 'ghost',
}: InboxActionsDropdownProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button className={triggerClassName} size="icon" variant={triggerVariant}>
          <Settings2 className="h-4 w-4" />
          <span className="sr-only">Inbox settings</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[80]">
        <DropdownMenuItem onSelect={onUploadIcon}>
          <ImagePlus className="h-4 w-4" />
          Upload Icon
        </DropdownMenuItem>
        {inbox.customIconDataUrl ? (
          <DropdownMenuItem onSelect={onResetIcon}>
            <RotateCcw className="h-4 w-4" />
            Reset Icon
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRename}>
          <Pencil className="h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onOpenSleepSettings}>
          <MoonStar className="h-4 w-4" />
          Sleep
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onOpenExternal}>
          <ExternalLink className="h-4 w-4" />
          Open External
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-danger focus:text-danger" onSelect={onRemove}>
          <Trash2 className="h-4 w-4" />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
