'use client';

import { ExternalLink, GripVertical, ImagePlus, MoonStar, Pencil, RotateCcw, Settings2, Trash2 } from 'lucide-react';

import type { MailboxRecord } from '@shared/mailboxes';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { MailboxAvatar } from './provider-presentation';

function UnreadIndicator({ inbox, collapsed = false }: { inbox: MailboxRecord; collapsed?: boolean }) {
  if (inbox.unreadState === 'count' && inbox.unreadCount && inbox.unreadCount > 0) {
    return collapsed ? (
      <Badge className="absolute -right-2 -top-2 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]">
        {inbox.unreadCount > 99 ? '99+' : inbox.unreadCount}
      </Badge>
    ) : (
      <Badge className="min-w-9 justify-center px-2.5 text-[11px]">{inbox.unreadCount > 99 ? '99+' : inbox.unreadCount}</Badge>
    );
  }

  if (inbox.unreadState === 'dot') {
    return collapsed ? (
      <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-primary shadow-[0_0_0_2px_hsl(var(--card))]" />
    ) : (
      <span className="h-3 w-3 rounded-full bg-primary shadow-[0_0_0_2px_hsl(var(--card))]" />
    );
  }

  return null;
}

interface InboxRowProps {
  inbox: MailboxRecord;
  active: boolean;
  collapsed: boolean;
  dragging: boolean;
  dragOver: boolean;
  onSelect: () => void;
  onRename: () => void;
  onRemove: () => void;
  onOpenSleepSettings: () => void;
  onOpenExternal: () => void;
  onUploadIcon: () => void;
  onResetIcon: () => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

export function InboxRow({
  inbox,
  active,
  collapsed,
  dragging,
  dragOver,
  onSelect,
  onRename,
  onRemove,
  onOpenSleepSettings,
  onOpenExternal,
  onUploadIcon,
  onResetIcon,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: InboxRowProps) {
  return (
    <div
      draggable
      className={cn(
        'group relative flex items-center gap-2 rounded-xl border p-1.5 transition',
        active ? 'border-primary/28 bg-card/88 shadow-soft' : 'border-transparent bg-transparent hover:bg-card/55',
        dragOver && 'border-primary/28 bg-primary/8',
        dragging && 'scale-[0.985] opacity-55',
        inbox.sleepState === 'sleeping' && 'opacity-80',
        collapsed && 'justify-center p-1.5',
      )}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={onDrop}
    >
      {!collapsed ? (
        <div className="flex h-10 w-8 shrink-0 cursor-grab items-center justify-center text-muted-foreground/65 transition group-hover:text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
      ) : null}

      <button
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 text-left outline-none transition hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring',
          collapsed ? 'relative h-12 justify-center rounded-lg px-0 py-0' : 'rounded-lg px-3 py-2',
        )}
        onClick={onSelect}
        title={inbox.displayName}
        type="button"
      >
        <div className="relative shrink-0">
          <MailboxAvatar
            provider={inbox.provider}
            accountAvatarDataUrl={inbox.accountAvatarDataUrl}
            customIconDataUrl={inbox.customIconDataUrl}
            className={cn(collapsed ? 'h-10 w-10 min-h-10 min-w-10' : 'h-9 w-9 min-h-9 min-w-9')}
            iconClassName="h-[18px] w-[18px]"
          />
          {collapsed ? <UnreadIndicator inbox={inbox} collapsed /> : null}
          {collapsed && inbox.sleepState === 'sleeping' ? (
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-card shadow-sm">
              <MoonStar className="h-2.5 w-2.5 text-muted-foreground" />
            </span>
          ) : null}
        </div>

        {!collapsed ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <div className="truncate text-sm font-medium">{inbox.displayName}</div>
                {inbox.sleepState === 'sleeping' ? (
                  <span
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
                    aria-label="Sleeping"
                    title="Sleeping"
                  >
                    <MoonStar className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </div>
            </div>

            <UnreadIndicator inbox={inbox} />
          </>
        ) : null}
      </button>

      {!collapsed ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="app-no-drag opacity-0 transition group-hover:opacity-100 data-[state=open]:opacity-100"
              size="icon"
              variant="ghost"
            >
              <Settings2 className="h-4 w-4" />
              <span className="sr-only">Inbox settings</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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
              Rename
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
      ) : null}
    </div>
  );
}
