'use client';

import { useEffect, useMemo, useState } from 'react';
import { FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react';

import {
  DEFAULT_MAILBOX_GROUP_EMOJI,
  DEFAULT_MAILBOX_GROUP_ICON_ID,
  DEFAULT_MAILBOX_GROUP_ID,
  DEFAULT_MAILBOX_GROUP_NAME,
  getProviderLabel,
  MAILBOX_PROVIDERS,
  type MailboxGroup,
  type MailboxProvider,
  type MailboxRecord,
} from '@shared/mailboxes';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { GroupIcon, GROUP_EMOJI_OPTIONS, resolveGroupEmoji } from './group-icons';

export type SidebarPanelState =
  | { type: 'add-inbox' }
  | { type: 'edit-inbox'; inbox: MailboxRecord }
  | { type: 'remove-inbox'; inbox: MailboxRecord }
  | { type: 'add-group' }
  | { type: 'rename-group'; group: MailboxGroup }
  | { type: 'remove-group'; group: MailboxGroup };

interface InboxSidebarPanelProps {
  groups: MailboxGroup[];
  panel: SidebarPanelState | null;
  onClose: () => void;
  onCreateInbox: (input: { provider: MailboxProvider; displayName?: string; groupId: string }) => Promise<void>;
  onUpdateInbox: (id: string, input: { displayName: string; groupId: string }) => Promise<void>;
  onRemoveInbox: (id: string) => Promise<void>;
  onCreateGroup: (input: { name: string; emoji: string | null }) => Promise<void>;
  onRenameGroup: (id: string, input: { name: string; emoji: string | null }) => Promise<void>;
  onRemoveGroup: (id: string) => Promise<void>;
}

function getDefaultGroupId(groups: MailboxGroup[]): string {
  return groups.find((group) => group.id === DEFAULT_MAILBOX_GROUP_ID)?.id ?? groups[0]?.id ?? DEFAULT_MAILBOX_GROUP_ID;
}

function getPanelCopy(panel: SidebarPanelState) {
  switch (panel.type) {
    case 'add-inbox':
      return {
        title: 'Add Inbox',
        description: 'Choose a provider, name it, and place it in a group.',
        icon: Plus,
        iconTone: 'text-primary',
      };
    case 'edit-inbox':
      return {
        title: 'Rename',
        description: panel.inbox.displayName,
        icon: Pencil,
        iconTone: 'text-primary',
      };
    case 'remove-inbox':
      return {
        title: 'Remove Inbox',
        description: panel.inbox.displayName,
        icon: Trash2,
        iconTone: 'text-danger',
      };
    case 'add-group':
      return {
        title: 'New Group',
        description: 'Create a grouped accordion for related inboxes.',
        icon: FolderPlus,
        iconTone: 'text-primary',
      };
    case 'rename-group':
      return {
        title: 'Edit Group',
        description: panel.group.name,
        icon: Pencil,
        iconTone: 'text-primary',
      };
    case 'remove-group':
      return {
        title: 'Remove Group',
        description: panel.group.name,
        icon: Trash2,
        iconTone: 'text-danger',
      };
  }
}

export function InboxSidebarPanel({
  groups,
  panel,
  onClose,
  onCreateInbox,
  onUpdateInbox,
  onRemoveInbox,
  onCreateGroup,
  onRenameGroup,
  onRemoveGroup,
}: InboxSidebarPanelProps) {
  const defaultGroupId = useMemo(() => getDefaultGroupId(groups), [groups]);
  const defaultGroupName = useMemo(
    () => groups.find((group) => group.id === DEFAULT_MAILBOX_GROUP_ID)?.name ?? DEFAULT_MAILBOX_GROUP_NAME,
    [groups],
  );
  const [provider, setProvider] = useState<MailboxProvider>('gmail');
  const [displayName, setDisplayName] = useState('');
  const [groupId, setGroupId] = useState(defaultGroupId);
  const [groupName, setGroupName] = useState('');
  const [groupEmoji, setGroupEmoji] = useState(DEFAULT_MAILBOX_GROUP_EMOJI);
  const [groupEmojiSearch, setGroupEmojiSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const panelKey = !panel
    ? 'closed'
    : panel.type === 'add-inbox' || panel.type === 'add-group'
      ? panel.type
      : `${panel.type}:${'inbox' in panel ? panel.inbox.id : panel.group.id}`;

  useEffect(() => {
    if (!panel) {
      setProvider('gmail');
      setDisplayName('');
      setGroupId(defaultGroupId);
      setGroupName('');
      setGroupEmoji(DEFAULT_MAILBOX_GROUP_EMOJI);
      setGroupEmojiSearch('');
      setError(null);
      setIsPending(false);
      return;
    }

    switch (panel.type) {
      case 'add-inbox':
        setProvider('gmail');
        setDisplayName('');
        setGroupId(defaultGroupId);
        setGroupName('');
        setGroupEmoji(DEFAULT_MAILBOX_GROUP_EMOJI);
        setGroupEmojiSearch('');
        break;
      case 'edit-inbox':
        setProvider(panel.inbox.provider);
        setDisplayName(panel.inbox.displayName);
        setGroupId(panel.inbox.groupId);
        setGroupName('');
        setGroupEmoji(DEFAULT_MAILBOX_GROUP_EMOJI);
        setGroupEmojiSearch('');
        break;
      case 'remove-inbox':
        setProvider(panel.inbox.provider);
        setDisplayName(panel.inbox.displayName);
        setGroupId(panel.inbox.groupId);
        setGroupName('');
        setGroupEmoji(DEFAULT_MAILBOX_GROUP_EMOJI);
        setGroupEmojiSearch('');
        break;
      case 'add-group':
        setGroupName('');
        setDisplayName('');
        setGroupId(defaultGroupId);
        setGroupEmoji(DEFAULT_MAILBOX_GROUP_EMOJI);
        setGroupEmojiSearch('');
        break;
      case 'rename-group':
        setGroupEmoji(resolveGroupEmoji(panel.group.emoji, panel.group.icon, panel.group.id));
        setGroupName(panel.group.name);
        setDisplayName('');
        setGroupId(defaultGroupId);
        setGroupEmojiSearch('');
        break;
      case 'remove-group':
        setGroupName(panel.group.name);
        setGroupEmoji(resolveGroupEmoji(panel.group.emoji, panel.group.icon, panel.group.id));
        setDisplayName('');
        setGroupId(defaultGroupId);
        setGroupEmojiSearch('');
        break;
    }

    setError(null);
    setIsPending(false);
  }, [defaultGroupId, panelKey]);

  const filteredGroupEmojiOptions = useMemo(() => {
    const query = groupEmojiSearch.trim().toLowerCase();

    if (!query) {
      return GROUP_EMOJI_OPTIONS;
    }

    return GROUP_EMOJI_OPTIONS.filter((option) =>
      [option.emoji, option.label, ...option.keywords].some((value) => value.toLowerCase().includes(query)),
    );
  }, [groupEmojiSearch]);

  if (!panel) {
    return null;
  }

  const panelCopy = getPanelCopy(panel);
  const PanelIcon = panelCopy.icon;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      switch (panel.type) {
        case 'add-inbox':
          await onCreateInbox({
            provider,
            displayName: displayName.trim() || undefined,
            groupId,
          });
          break;
        case 'edit-inbox':
          await onUpdateInbox(panel.inbox.id, {
            displayName,
            groupId,
          });
          break;
        case 'remove-inbox':
          await onRemoveInbox(panel.inbox.id);
          break;
        case 'add-group':
          await onCreateGroup({ name: groupName, emoji: groupEmoji });
          break;
        case 'rename-group':
          await onRenameGroup(panel.group.id, { name: groupName, emoji: groupEmoji });
          break;
        case 'remove-group':
          await onRemoveGroup(panel.group.id);
          break;
      }

      onClose();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to save.');
    } finally {
      setIsPending(false);
    }
  };

  const isRemoving = panel.type === 'remove-inbox' || panel.type === 'remove-group';
  const isGroupForm = panel.type === 'add-group' || panel.type === 'rename-group';
  const isInboxForm = panel.type === 'add-inbox' || panel.type === 'edit-inbox';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-[32rem]">
        <DialogHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/80',
                isRemoving ? 'text-danger' : panelCopy.iconTone,
              )}
            >
              <PanelIcon className="h-5 w-5" />
            </div>
            <div className="space-y-0">
              <DialogTitle>{panelCopy.title}</DialogTitle>
              <DialogDescription>{panelCopy.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isRemoving ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="rounded-[1.1rem] border border-border/55 bg-card/72 px-4 py-3 text-sm">
              {'inbox' in panel ? (
                <>
                  <div className="truncate font-medium tracking-tight">{panel.inbox.displayName}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    {getProviderLabel(panel.inbox.provider)}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/70 text-foreground">
                      <GroupIcon className="text-base" emoji={panel.group.emoji} groupId={panel.group.id} iconId={panel.group.icon} />
                    </span>
                    <div className="truncate font-medium tracking-tight">{panel.group.name}</div>
                  </div>
                  {panel.group.id !== DEFAULT_MAILBOX_GROUP_ID ? (
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">
                      Inboxes in this group will move to {defaultGroupName}.
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <DialogFooter className="justify-between">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" disabled={isPending}>
                Remove
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="rounded-[1.1rem] border border-border/55 bg-card/72 p-4">
              <div className="space-y-4">
                {panel.type === 'add-inbox' ? (
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground" htmlFor="provider">
                      Provider
                    </label>
                    <Select id="provider" value={provider} onChange={(event) => setProvider(event.target.value as MailboxProvider)}>
                      {MAILBOX_PROVIDERS.map((providerOption) => (
                        <option key={providerOption} value={providerOption}>
                          {getProviderLabel(providerOption)}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}

                {isInboxForm ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground" htmlFor="display-name">
                        Name
                      </label>
                      <Input
                        id="display-name"
                        autoFocus
                        autoComplete="off"
                        placeholder={panel.type === 'add-inbox' ? getProviderLabel(provider) : 'Inbox name'}
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground" htmlFor="group">
                        Group
                      </label>
                      <Select id="group" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </>
                ) : null}

                {isGroupForm ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground" htmlFor="group-name">
                        Group Name
                      </label>
                      <Input
                        id="group-name"
                        autoFocus
                        autoComplete="off"
                        placeholder="Group name"
                        value={groupName}
                        onChange={(event) => setGroupName(event.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        Group Emoji
                      </label>
                      <Input
                        autoComplete="off"
                        placeholder="Search emoji"
                        value={groupEmojiSearch}
                        onChange={(event) => setGroupEmojiSearch(event.target.value)}
                      />
                      <div className="max-h-[20rem] overflow-y-auto rounded-[1.1rem] border border-border/55 bg-card/72 p-3">
                        {filteredGroupEmojiOptions.length === 0 ? (
                          <div className="py-8 text-center text-sm text-muted-foreground">No emoji found.</div>
                        ) : (
                          <div className="grid grid-cols-7 gap-2">
                            {filteredGroupEmojiOptions.map((option) => {
                              const selected = option.emoji === groupEmoji;

                              return (
                                <button
                                  key={option.emoji}
                                  aria-label={option.label}
                                  aria-pressed={selected}
                                  className={cn(
                                    'flex aspect-square items-center justify-center rounded-[1rem] border transition hover:border-primary/36 hover:bg-accent/40',
                                    selected ? 'border-primary bg-accent/55 shadow-soft' : 'border-border/55 bg-background/50',
                                  )}
                                  title={option.label}
                                  type="button"
                                  onClick={() => setGroupEmoji(option.emoji)}
                                >
                                  <GroupIcon className="text-[1.35rem]" emoji={option.emoji} iconId={panel.type === 'rename-group' ? panel.group.icon : DEFAULT_MAILBOX_GROUP_ICON_ID} />
                                  <span className="sr-only">{option.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <DialogFooter className="justify-between">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {panel.type === 'add-inbox'
                  ? 'Add Inbox'
                  : panel.type === 'edit-inbox'
                    ? 'Save'
                    : panel.type === 'add-group'
                      ? 'Create Group'
                      : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
