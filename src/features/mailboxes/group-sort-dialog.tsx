'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { MailboxGroup } from '@shared/mailboxes';
import type { SaveSidebarLayoutInput } from '@shared/ipc';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import { GroupIcon } from './group-icons';

type GroupSortItem = {
  group: MailboxGroup;
  unreadIndicator: string | null;
};

interface GroupSortDialogProps {
  open: boolean;
  groups: GroupSortItem[];
  layout: SaveSidebarLayoutInput;
  onOpenChange: (open: boolean) => void;
  onSave: (layout: SaveSidebarLayoutInput) => Promise<void>;
}

function moveGroupIds(groupIds: string[], groupId: string, direction: -1 | 1) {
  const currentIndex = groupIds.indexOf(groupId);

  if (currentIndex === -1) {
    return groupIds;
  }

  const nextIndex = currentIndex + direction;

  if (nextIndex < 0 || nextIndex >= groupIds.length) {
    return groupIds;
  }

  const nextGroupIds = [...groupIds];
  const [movedGroupId] = nextGroupIds.splice(currentIndex, 1);
  nextGroupIds.splice(nextIndex, 0, movedGroupId);
  return nextGroupIds;
}

export function GroupSortDialog({ open, groups, layout, onOpenChange, onSave }: GroupSortDialogProps) {
  const groupIds = useMemo(() => groups.map(({ group }) => group.id), [groups]);
  const groupSignature = groupIds.join('|');
  const [orderedGroupIds, setOrderedGroupIds] = useState(groupIds);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setOrderedGroupIds(groupIds);
    setError(null);
    setIsPending(false);
  }, [groupSignature, open]);

  const groupsById = useMemo(() => new Map(groups.map((item) => [item.group.id, item])), [groups]);
  const orderedGroups = orderedGroupIds
    .map((groupId) => groupsById.get(groupId))
    .filter((item): item is GroupSortItem => Boolean(item));

  const canSave = orderedGroupIds.join('|') !== groupSignature;

  const handleSave = async () => {
    setError(null);
    setIsPending(true);

    try {
      const layoutById = new Map(layout.groups.map((entry) => [entry.groupId, entry]));
      const nextLayout: SaveSidebarLayoutInput = {
        groups: orderedGroupIds
          .map((groupId) => layoutById.get(groupId))
          .filter((entry): entry is SaveSidebarLayoutInput['groups'][number] => Boolean(entry))
          .map((entry) => ({
            groupId: entry.groupId,
            inboxIds: [...entry.inboxIds],
          })),
      };

      await onSave(nextLayout);
      onOpenChange(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to save group order.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[32rem]">
        <DialogHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/80 text-primary">
              <ArrowUpDown className="h-5 w-5" />
            </div>
            <div className="space-y-0">
              <DialogTitle>Sort Groups</DialogTitle>
              <DialogDescription>Adjust the order of your grouped accordions.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-[1.1rem] border border-border/55 bg-card/72 p-3">
            <div className="space-y-2">
              {orderedGroups.map(({ group, unreadIndicator }, index) => {
                const canMoveUp = index > 0;
                const canMoveDown = index < orderedGroups.length - 1;

                return (
                  <div
                    key={group.id}
                    className={cn(
                      'flex items-center gap-3 rounded-[1rem] border border-border/45 bg-background/70 px-3 py-2.5 transition',
                      !canMoveUp && !canMoveDown && 'opacity-80',
                    )}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/70 text-[15px]">
                      <GroupIcon className="text-[15px]" emoji={group.emoji} groupId={group.id} iconId={group.icon} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold tracking-tight">{group.name}</div>
                    </div>

                    {unreadIndicator ? (
                      unreadIndicator === '•' ? (
                        <span className="h-3 w-3 shrink-0 rounded-full bg-primary shadow-[0_0_0_2px_hsl(var(--card))]" />
                      ) : (
                        <Badge className="min-w-9 shrink-0 justify-center border border-primary/16 bg-primary-foreground px-2.5 text-[11px] text-primary shadow-none">
                          {unreadIndicator}
                        </Badge>
                      )
                    ) : null}

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        disabled={!canMoveUp || isPending}
                        onClick={() => setOrderedGroupIds((currentGroupIds) => moveGroupIds(currentGroupIds, group.id, -1))}
                      >
                        <ArrowUp className="h-4 w-4" />
                        <span className="sr-only">Move {group.name} up</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        disabled={!canMoveDown || isPending}
                        onClick={() => setOrderedGroupIds((currentGroupIds) => moveGroupIds(currentGroupIds, group.id, 1))}
                      >
                        <ArrowDown className="h-4 w-4" />
                        <span className="sr-only">Move {group.name} down</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <DialogFooter className="justify-between">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSave || isPending} onClick={() => void handleSave()}>
            Save Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
