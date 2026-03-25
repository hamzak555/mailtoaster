'use client';

import { GripVertical, MoonStar } from 'lucide-react';

import type { MailboxRecord } from '@shared/mailboxes';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { InboxActionsDropdown } from './inbox-actions-dropdown';
import { MailboxAvatar } from './provider-presentation';

function UnreadIndicator({ inbox }: { inbox: MailboxRecord }) {
  if (inbox.unreadState === 'count' && inbox.unreadCount && inbox.unreadCount > 0) {
    return (
      <Badge className="absolute -right-2 -top-2 z-20 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]">
        {inbox.unreadCount > 99 ? '99+' : inbox.unreadCount}
      </Badge>
    );
  }

  if (inbox.unreadState === 'dot') {
    return <span className="absolute -right-1 -top-1 z-20 h-3 w-3 rounded-full bg-primary shadow-[0_0_0_2px_hsl(var(--card))]" />;
  }

  return null;
}

interface InboxRowProps {
  inbox: MailboxRecord;
  active: boolean;
  collapsed: boolean;
  dragEnabled?: boolean;
  dragging: boolean;
  dragOver: boolean;
  onSelect: () => void;
  onRename: () => void;
  onRemove: () => void;
  onOpenSleepSettings: () => void;
  onOpenExternal: () => void;
  onUploadIcon: () => void;
  onResetIcon: () => void;
  onDragHandlePointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
}

export function InboxRow({
  inbox,
  active,
  collapsed,
  dragEnabled = true,
  dragging,
  dragOver,
  onSelect,
  onRename,
  onRemove,
  onOpenSleepSettings,
  onOpenExternal,
  onUploadIcon,
  onResetIcon,
  onDragHandlePointerDown,
}: InboxRowProps) {
  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 rounded-xl border p-1.5 transition',
        active ? 'border-primary/28 bg-card/88 shadow-soft' : 'border-transparent bg-transparent hover:bg-card/55',
        dragOver && 'border-primary/28 bg-primary/8',
        dragging && 'scale-[0.99] border-primary/28 bg-card/92 opacity-70 shadow-xl',
        inbox.sleepState === 'sleeping' && 'opacity-80',
        collapsed && 'justify-center p-1.5',
      )}
    >
      <button
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 text-left outline-none transition hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring',
          collapsed ? 'relative h-12 justify-center rounded-lg px-0 py-0' : 'rounded-lg px-3 py-2',
        )}
        onClick={onSelect}
        title={inbox.displayName}
        type="button"
      >
        <div
          className={cn('relative shrink-0', !collapsed && dragEnabled && 'cursor-grab active:cursor-grabbing')}
          onPointerDown={dragEnabled ? onDragHandlePointerDown : undefined}
        >
          <div className={cn('relative overflow-hidden rounded-full', !collapsed && dragEnabled && 'group/avatar')}>
            <MailboxAvatar
              provider={inbox.provider}
              accountAvatarDataUrl={inbox.accountAvatarDataUrl}
              customIconDataUrl={inbox.customIconDataUrl}
              className={cn(collapsed ? 'h-10 w-10 min-h-10 min-w-10' : 'h-9 w-9 min-h-9 min-w-9')}
              iconClassName="h-[18px] w-[18px]"
            />
            {!collapsed && dragEnabled ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-full bg-primary opacity-0 transition duration-150 group-hover/avatar:opacity-100"
                title="Reorder inbox"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground text-primary shadow-[0_6px_18px_rgba(0,0,0,0.22)]">
                  <GripVertical className="h-4 w-4" />
                </span>
              </div>
            ) : null}
          </div>
          <UnreadIndicator inbox={inbox} />
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
          </>
        ) : null}
      </button>

      {!collapsed ? (
        <InboxActionsDropdown
          inbox={inbox}
          triggerClassName="app-no-drag opacity-0 transition group-hover:opacity-100 data-[state=open]:opacity-100"
          onOpenExternal={onOpenExternal}
          onOpenSleepSettings={onOpenSleepSettings}
          onRemove={onRemove}
          onRename={onRename}
          onResetIcon={onResetIcon}
          onUploadIcon={onUploadIcon}
        />
      ) : null}
    </div>
  );
}
