'use client';

import { ChevronDown, ChevronLeft, ChevronRight, Download, FolderPlus, GripVertical, LoaderCircle, MoonStar, MoreHorizontal, Plus, Settings2, TriangleAlert } from 'lucide-react';
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_MAILBOX_GROUP_ID,
  compareMailboxGroups,
  compareMailboxes,
  getAggregateUnreadCount,
  hasAggregateUnreadDot,
  type MailboxGroup,
  type MailboxRecord,
} from '@shared/mailboxes';
import type { AppUpdateState, SaveSidebarLayoutInput } from '@shared/ipc';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { AppSettingsDialog } from './app-settings-dialog';
import { GroupIcon } from './group-icons';
import { GroupSortDialog } from './group-sort-dialog';
import { InboxRow } from './inbox-row';
import { InboxSleepDialog } from './inbox-sleep-dialog';
import { InboxSidebarPanel, type SidebarPanelState } from './inbox-sidebar-panel';
import { MailboxToolbar } from './mailbox-toolbar';
import { MailboxAvatar } from './provider-presentation';
import { useAppliedAccentTheme } from './use-applied-accent-theme';
import { useAppUpdateState } from './use-app-update-state';
import { useMailToaster } from './use-mail-toaster';

const ICON_EXPORT_SIZE = 160;
const SIDEBAR_POINTER_DRAG_THRESHOLD_PX = 10;

type SidebarPanelMode =
  | { type: 'add-inbox' }
  | { type: 'edit-inbox'; inboxId: string }
  | { type: 'remove-inbox'; inboxId: string }
  | { type: 'add-group' }
  | { type: 'rename-group'; groupId: string }
  | { type: 'remove-group'; groupId: string };

type DragPlacement = 'before' | 'after';
type SidebarGroupLayout = SaveSidebarLayoutInput['groups'][number];
type PointerPoint = { x: number; y: number };
type SidebarPointerDrag =
  | {
      kind: 'group';
      pointerId: number;
      groupId: string;
      origin: PointerPoint;
      current: PointerPoint;
      offset: PointerPoint;
      rect: { width: number; height: number };
      active: boolean;
      name: string;
      icon: MailboxGroup['icon'];
      emoji: MailboxGroup['emoji'];
    }
  | {
      kind: 'inbox';
      pointerId: number;
      inboxId: string;
      groupId: string;
      origin: PointerPoint;
      current: PointerPoint;
      offset: PointerPoint;
      rect: { width: number; height: number };
      active: boolean;
      inbox: MailboxRecord;
    };

function getVerticalDragPlacement(bounds: DOMRect, clientY: number): DragPlacement {
  return clientY >= bounds.top + bounds.height / 2 ? 'after' : 'before';
}

function sidebarLayoutsMatch(left: SaveSidebarLayoutInput, right: SaveSidebarLayoutInput) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasExceededPointerDragThreshold(origin: PointerPoint, current: PointerPoint) {
  return Math.hypot(current.x - origin.x, current.y - origin.y) >= SIDEBAR_POINTER_DRAG_THRESHOLD_PX;
}

function getGroupUnreadIndicator(inboxes: Pick<MailboxRecord, 'unreadState' | 'unreadCount'>[]) {
  const unreadCount = getAggregateUnreadCount(inboxes);
  const hasUnreadDot = hasAggregateUnreadDot(inboxes);

  if (unreadCount > 0) {
    return unreadCount > 99 ? '99+' : String(unreadCount);
  }

  return hasUnreadDot ? '•' : null;
}

function moveGroupLayouts(
  groups: SidebarGroupLayout[],
  sourceGroupId: string,
  targetGroupId: string,
  placement: DragPlacement,
): SidebarGroupLayout[] {
  if (sourceGroupId === targetGroupId) {
    return groups;
  }

  const sourceIndex = groups.findIndex((group) => group.groupId === sourceGroupId);
  const targetIndex = groups.findIndex((group) => group.groupId === targetGroupId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return groups;
  }

  const nextGroups = groups.map((group) => ({
    ...group,
    inboxIds: [...group.inboxIds],
  }));
  const [movedGroup] = nextGroups.splice(sourceIndex, 1);
  const adjustedTargetIndex = nextGroups.findIndex((group) => group.groupId === targetGroupId);

  if (adjustedTargetIndex === -1) {
    return groups;
  }

  nextGroups.splice(placement === 'after' ? adjustedTargetIndex + 1 : adjustedTargetIndex, 0, movedGroup);
  return nextGroups;
}

function moveInboxAcrossGroups(
  layout: SaveSidebarLayoutInput,
  sourceInboxId: string,
  targetGroupId: string,
  targetInboxId?: string | null,
  placement: DragPlacement = 'after',
): SaveSidebarLayoutInput {
  const nextGroups = layout.groups.map((group) => ({
    ...group,
    inboxIds: group.inboxIds.filter((inboxId) => inboxId !== sourceInboxId),
  }));
  const targetGroup = nextGroups.find((group) => group.groupId === targetGroupId);

  if (!targetGroup) {
    return layout;
  }

  if (!targetInboxId || !targetGroup.inboxIds.includes(targetInboxId)) {
    targetGroup.inboxIds.push(sourceInboxId);
    return { groups: nextGroups };
  }

  const targetIndex = targetGroup.inboxIds.indexOf(targetInboxId);
  targetGroup.inboxIds.splice(placement === 'after' ? targetIndex + 1 : targetIndex, 0, sourceInboxId);

  return { groups: nextGroups };
}

function getSidebarUpdateIndicator(state: AppUpdateState | null) {
  if (!state) {
    return null;
  }

  switch (state.phase) {
    case 'downloading':
      return {
        kind: 'progress' as const,
        label:
          typeof state.progressPercent === 'number'
            ? `Updating ${Math.max(0, Math.round(state.progressPercent))}%`
            : 'Downloading update',
        title: state.availableVersion ? `Downloading Mail Toaster ${state.availableVersion}` : 'Downloading Mail Toaster update',
      };
    case 'downloaded':
      return {
        kind: state.canInstall ? ('install' as const) : ('progress' as const),
        label: state.availableVersion ? `Update ${state.availableVersion}` : 'Update ready',
        title: state.canInstall
          ? `Install Mail Toaster ${state.availableVersion ?? ''}`.trim()
          : state.detail ?? 'Update downloaded',
      };
    case 'installing':
      return {
        kind: 'progress' as const,
        label: state.availableVersion ? `Installing ${state.availableVersion}` : 'Installing update',
        title: state.detail ?? 'Installing Mail Toaster update',
      };
    default:
      return null;
  }
}

function getSidebarUpdatePanel(state: AppUpdateState | null) {
  if (!state) {
    return null;
  }

  switch (state.phase) {
    case 'downloaded':
      return {
        tone: state.canInstall ? ('primary' as const) : ('warning' as const),
        title: state.availableVersion ? `Update ${state.availableVersion} ready` : 'Update ready',
        detail:
          state.detail ??
          (state.canInstall ? 'Restart Mail Toaster to finish installing the downloaded update.' : 'The update has finished downloading.'),
        canInstall: state.canInstall,
      };
    case 'installing':
      return {
        tone: 'primary' as const,
        title: state.availableVersion ? `Installing ${state.availableVersion}` : 'Installing update',
        detail: state.detail ?? 'Mail Toaster is restarting to finish the update.',
        canInstall: false,
      };
    case 'error':
      return {
        tone: 'danger' as const,
        title: 'Update problem',
        detail: state.detail ?? 'Mail Toaster could not complete the update.',
        canInstall: false,
      };
    case 'unsupported-location':
      return {
        tone: 'danger' as const,
        title: 'Update setup required',
        detail: state.detail ?? 'Automatic updates are unavailable in the current installation of Mail Toaster.',
        canInstall: false,
      };
    default:
      return null;
  }
}

async function prepareInboxIconDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Unsupported image format.');
  }

  return await new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = ICON_EXPORT_SIZE;
      canvas.height = ICON_EXPORT_SIZE;

      const context = canvas.getContext('2d');

      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Image processing unavailable.'));
        return;
      }

      const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const x = (canvas.width - drawWidth) / 2;
      const y = (canvas.height - drawHeight) / 2;

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, x, y, drawWidth, drawHeight);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/png'));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to read image.'));
    };

    image.src = objectUrl;
  });
}

export function MailToasterShell() {
  const { state, selectedInbox, ready, error, actions } = useMailToaster();
  const { updateState, installDownloadedUpdate } = useAppUpdateState();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [panelMode, setPanelMode] = useState<SidebarPanelMode | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sleepDialogInboxId, setSleepDialogInboxId] = useState<string | null>(null);
  const [groupSortOpen, setGroupSortOpen] = useState(false);
  const [toolbarActionsOpen, setToolbarActionsOpen] = useState(false);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [draggedInboxId, setDraggedInboxId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [dragOverInboxId, setDragOverInboxId] = useState<string | null>(null);
  const [previewSidebarLayout, setPreviewSidebarLayout] = useState<SaveSidebarLayoutInput | null>(null);
  const [pointerDrag, setPointerDrag] = useState<SidebarPointerDrag | null>(null);
  const [iconUploadTargetId, setIconUploadTargetId] = useState<string | null>(null);
  const [sidebarNotice, setSidebarNotice] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const groupSectionRefs = useRef(new Map<string, HTMLElement>());
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const rowTopsRef = useRef(new Map<string, number>());
  const flipFrameRef = useRef<number | null>(null);
  const pointerDragRef = useRef<SidebarPointerDrag | null>(null);
  const reorderCommittedRef = useRef(false);
  const groupById = useMemo(() => new Map(state.groups.map((group) => [group.id, group])), [state.groups]);
  const inboxById = useMemo(() => new Map(state.inboxes.map((inbox) => [inbox.id, inbox])), [state.inboxes]);
  const editTarget = panelMode?.type === 'edit-inbox' ? inboxById.get(panelMode.inboxId) ?? null : null;
  const removeTarget = panelMode?.type === 'remove-inbox' ? inboxById.get(panelMode.inboxId) ?? null : null;
  const renameGroupTarget = panelMode?.type === 'rename-group' ? groupById.get(panelMode.groupId) ?? null : null;
  const removeGroupTarget = panelMode?.type === 'remove-group' ? groupById.get(panelMode.groupId) ?? null : null;
  const sleepDialogTarget = sleepDialogInboxId ? state.inboxes.find((inbox) => inbox.id === sleepDialogInboxId) ?? null : null;
  const orderedGroups = useMemo(() => [...state.groups].sort(compareMailboxGroups), [state.groups]);
  const totalUnreadCount = getAggregateUnreadCount(state.inboxes);
  const hasUnreadDot = hasAggregateUnreadDot(state.inboxes);
  const actualSidebarLayout = useMemo<SaveSidebarLayoutInput>(
    () => ({
      groups: orderedGroups.map((group) => ({
        groupId: group.id,
        inboxIds: state.inboxes
          .filter((inbox) => inbox.groupId === group.id)
          .sort(compareMailboxes)
          .map((inbox) => inbox.id),
      })),
    }),
    [orderedGroups, state.inboxes],
  );
  const renderedSidebarLayout = previewSidebarLayout ?? actualSidebarLayout;
  const renderedGroupSections = useMemo(
    () =>
      renderedSidebarLayout.groups
        .map((layoutGroup) => {
          const group = groupById.get(layoutGroup.groupId);

          if (!group) {
            return null;
          }

          const inboxes = layoutGroup.inboxIds
            .map((inboxId) => inboxById.get(inboxId))
            .filter((inbox): inbox is MailboxRecord => Boolean(inbox));

          return {
            group,
            inboxes,
          };
        })
        .filter((section): section is { group: MailboxGroup; inboxes: MailboxRecord[] } => Boolean(section)),
    [groupById, inboxById, renderedSidebarLayout],
  );
  const renderedInboxes = useMemo(
    () => renderedGroupSections.flatMap((section) => section.inboxes),
    [renderedGroupSections],
  );
  const totalUnreadBadge = totalUnreadCount > 0 ? `${totalUnreadCount}${hasUnreadDot ? '+' : ''}` : hasUnreadDot ? '•' : null;
  const unreadSummaryText =
    totalUnreadCount > 0
      ? `${totalUnreadBadge} unread`
      : hasUnreadDot
        ? 'Unread'
        : `${state.inboxes.length} inbox${state.inboxes.length === 1 ? '' : 'es'}`;
  const selectedViewState = selectedInbox ? state.viewStates[selectedInbox.id] : undefined;
  const sidebarUpdateIndicator = useMemo(() => getSidebarUpdateIndicator(updateState), [updateState]);
  const sidebarUpdatePanel = useMemo(() => getSidebarUpdatePanel(updateState), [updateState]);
  const groupSortItems = useMemo(
    () =>
      orderedGroups.map((group) => ({
        group,
        unreadIndicator: getGroupUnreadIndicator(state.inboxes.filter((inbox) => inbox.groupId === group.id)),
      })),
    [orderedGroups, state.inboxes],
  );

  useAppliedAccentTheme(state.appearanceSettings.accentThemeId);

  const sidebarPanel: SidebarPanelState | null =
    panelMode?.type === 'add-inbox'
      ? { type: 'add-inbox' }
      : panelMode?.type === 'edit-inbox' && editTarget
        ? { type: 'edit-inbox', inbox: editTarget }
        : panelMode?.type === 'remove-inbox' && removeTarget
          ? { type: 'remove-inbox', inbox: removeTarget }
          : panelMode?.type === 'add-group'
            ? { type: 'add-group' }
            : panelMode?.type === 'rename-group' && renameGroupTarget
              ? { type: 'rename-group', group: renameGroupTarget }
              : panelMode?.type === 'remove-group' && removeGroupTarget
                ? { type: 'remove-group', group: removeGroupTarget }
                : null;
  const nativeOverlayVisible = settingsOpen || sleepDialogInboxId !== null || sidebarPanel !== null || toolbarActionsOpen || groupSortOpen;

  useEffect(() => {
    if (panelMode && !sidebarPanel) {
      setPanelMode(null);
    }
  }, [panelMode, sidebarPanel]);

  useEffect(() => {
    if (sleepDialogInboxId && !sleepDialogTarget) {
      setSleepDialogInboxId(null);
    }
  }, [sleepDialogInboxId, sleepDialogTarget]);

  useEffect(() => {
    if (!previewSidebarLayout) {
      return;
    }

    if (sidebarLayoutsMatch(previewSidebarLayout, actualSidebarLayout)) {
      reorderCommittedRef.current = false;
      setPreviewSidebarLayout(null);
      return;
    }

    if (!draggedInboxId && !draggedGroupId && !reorderCommittedRef.current) {
      setPreviewSidebarLayout(null);
    }
  }, [actualSidebarLayout, draggedGroupId, draggedInboxId, previewSidebarLayout]);

  useEffect(() => {
    void actions.setNativeOverlayVisible(nativeOverlayVisible);
  }, [actions, nativeOverlayVisible]);

  useEffect(
    () => () => {
      void actions.setNativeOverlayVisible(false);
    },
    [actions],
  );

  useEffect(() => {
    if (!selectedInbox && toolbarActionsOpen) {
      setToolbarActionsOpen(false);
    }
  }, [selectedInbox, toolbarActionsOpen]);

  useLayoutEffect(() => {
    if (flipFrameRef.current) {
      cancelAnimationFrame(flipFrameRef.current);
      flipFrameRef.current = null;
    }

    const nextRowTops = new Map<string, number>();
    const animations: Array<() => void> = [];

    for (const inbox of renderedInboxes) {
      const row = rowRefs.current.get(inbox.id);

      if (!row) {
        continue;
      }

      const nextTop = row.getBoundingClientRect().top;
      const previousTop = rowTopsRef.current.get(inbox.id);
      nextRowTops.set(inbox.id, nextTop);

      if (previousTop === undefined) {
        continue;
      }

      const deltaY = previousTop - nextTop;

      if (!deltaY) {
        continue;
      }

      row.style.transition = 'transform 0s';
      row.style.transform = `translateY(${deltaY}px)`;

      animations.push(() => {
        row.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)';
        row.style.transform = 'translateY(0)';
      });
    }

    rowTopsRef.current = nextRowTops;

    if (animations.length > 0) {
      flipFrameRef.current = window.requestAnimationFrame(() => {
        animations.forEach((animate) => animate());
        flipFrameRef.current = null;
      });
    }

    return () => {
      if (flipFrameRef.current) {
        cancelAnimationFrame(flipFrameRef.current);
        flipFrameRef.current = null;
      }
    };
  }, [renderedInboxes, sidebarCollapsed]);

  const clearDragState = () => {
    pointerDragRef.current = null;
    setPointerDrag(null);
    setDraggedGroupId(null);
    setDraggedInboxId(null);
    setDragOverGroupId(null);
    setDragOverInboxId(null);
  };

  const handleSidebarLayoutSave = async (layout: SaveSidebarLayoutInput) => {
    if (sidebarLayoutsMatch(layout, actualSidebarLayout)) {
      return;
    }

    await actions.saveSidebarLayout(layout);
  };

  const commitSidebarLayout = (layout: SaveSidebarLayoutInput) => {
    reorderCommittedRef.current = true;
    setPreviewSidebarLayout(layout);
    clearDragState();

    void handleSidebarLayoutSave(layout).catch(() => {
      reorderCommittedRef.current = false;
      setPreviewSidebarLayout(null);
    });
  };

  const getClosestGroupSection = (point: PointerPoint, excludedGroupId?: string) => {
    const candidates = renderedGroupSections
      .filter(({ group }) => group.id !== excludedGroupId)
      .map(({ group, inboxes }) => {
        const element = groupSectionRefs.current.get(group.id);

        if (!element) {
          return null;
        }

        const bounds = element.getBoundingClientRect();
        const horizontalDistance = point.x < bounds.left ? bounds.left - point.x : point.x > bounds.right ? point.x - bounds.right : 0;
        const verticalDistance = point.y < bounds.top ? bounds.top - point.y : point.y > bounds.bottom ? point.y - bounds.bottom : 0;

        return {
          group,
          inboxes,
          bounds,
          distance: Math.hypot(horizontalDistance, verticalDistance),
          inside: horizontalDistance === 0 && verticalDistance === 0,
        };
      })
      .filter(
        (candidate): candidate is {
          group: MailboxGroup;
          inboxes: MailboxRecord[];
          bounds: DOMRect;
          distance: number;
          inside: boolean;
        } => Boolean(candidate),
      );

    if (candidates.length === 0) {
      return null;
    }

    return candidates.find((candidate) => candidate.inside) ?? [...candidates].sort((left, right) => left.distance - right.distance)[0]!;
  };

  const getInboxDropTarget = (point: PointerPoint, sourceInboxId: string) => {
    const targetSection = getClosestGroupSection(point);

    if (!targetSection) {
      return null;
    }

    const rowCandidates = targetSection.inboxes
      .filter((inbox) => inbox.id !== sourceInboxId)
      .map((inbox) => {
        const element = rowRefs.current.get(inbox.id);

        if (!element) {
          return null;
        }

        const bounds = element.getBoundingClientRect();
        const horizontalDistance = point.x < bounds.left ? bounds.left - point.x : point.x > bounds.right ? point.x - bounds.right : 0;
        const verticalDistance = point.y < bounds.top ? bounds.top - point.y : point.y > bounds.bottom ? point.y - bounds.bottom : 0;

        return {
          inbox,
          bounds,
          distance: Math.hypot(horizontalDistance, verticalDistance),
          inside: horizontalDistance === 0 && verticalDistance === 0,
        };
      })
      .filter(
        (candidate): candidate is { inbox: MailboxRecord; bounds: DOMRect; distance: number; inside: boolean } => Boolean(candidate),
      );

    if (targetSection.group.collapsed || rowCandidates.length === 0) {
      return {
        groupId: targetSection.group.id,
        targetInboxId: null,
        placement: 'after' as DragPlacement,
        dragOverInboxId: null,
        dragOverGroupId: targetSection.group.id,
      };
    }

    const targetRow =
      rowCandidates.find((candidate) => candidate.inside) ?? [...rowCandidates].sort((left, right) => left.distance - right.distance)[0]!;

    return {
      groupId: targetSection.group.id,
      targetInboxId: targetRow.inbox.id,
      placement: getVerticalDragPlacement(targetRow.bounds, point.y),
      dragOverInboxId: targetRow.inbox.id,
      dragOverGroupId: targetSection.group.id,
    };
  };

  const beginGroupPointerDrag = (event: React.PointerEvent<HTMLButtonElement>, group: MailboxGroup) => {
    if (sidebarCollapsed) {
      return;
    }

    const element = groupSectionRefs.current.get(group.id) ?? event.currentTarget;
    const bounds = element.getBoundingClientRect();
    const session: SidebarPointerDrag = {
      kind: 'group',
      pointerId: event.pointerId,
      groupId: group.id,
      origin: { x: event.clientX, y: event.clientY },
      current: { x: event.clientX, y: event.clientY },
      offset: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      rect: { width: bounds.width, height: bounds.height },
      active: false,
      name: group.name,
      icon: group.icon,
      emoji: group.emoji,
    };

    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();

    reorderCommittedRef.current = false;
    pointerDragRef.current = session;
    setPointerDrag(session);
    setDraggedGroupId(group.id);
    setDraggedInboxId(null);
    setDragOverGroupId(null);
    setDragOverInboxId(null);
    setPreviewSidebarLayout(null);
  };

  const beginInboxPointerDrag = (event: React.PointerEvent<HTMLDivElement>, inbox: MailboxRecord) => {
    if (sidebarCollapsed) {
      return;
    }

    const element = rowRefs.current.get(inbox.id);

    if (!element) {
      return;
    }

    const bounds = element.getBoundingClientRect();
    const session: SidebarPointerDrag = {
      kind: 'inbox',
      pointerId: event.pointerId,
      inboxId: inbox.id,
      groupId: inbox.groupId,
      origin: { x: event.clientX, y: event.clientY },
      current: { x: event.clientX, y: event.clientY },
      offset: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      rect: { width: bounds.width, height: bounds.height },
      active: false,
      inbox,
    };

    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();

    reorderCommittedRef.current = false;
    pointerDragRef.current = session;
    setPointerDrag(session);
    setDraggedGroupId(null);
    setDraggedInboxId(inbox.id);
    setDragOverGroupId(null);
    setDragOverInboxId(null);
    setPreviewSidebarLayout(null);
  };

  const handleWindowPointerMove = useEffectEvent((event: PointerEvent) => {
    const currentDrag = pointerDragRef.current;

    if (!currentDrag || event.pointerId !== currentDrag.pointerId) {
      return;
    }

    const point = { x: event.clientX, y: event.clientY };
    const nextDrag: SidebarPointerDrag = {
      ...currentDrag,
      current: point,
      active: currentDrag.active || hasExceededPointerDragThreshold(currentDrag.origin, point),
    };

    pointerDragRef.current = nextDrag;
    setPointerDrag(nextDrag);

    if (!nextDrag.active) {
      return;
    }

    if (nextDrag.kind === 'group') {
      const targetSection = getClosestGroupSection(point, nextDrag.groupId);

      setDraggedGroupId(nextDrag.groupId);
      setDraggedInboxId(null);
      setDragOverInboxId(null);

      if (!targetSection) {
        setDragOverGroupId(null);
        setPreviewSidebarLayout(null);
        return;
      }

      const nextLayout = {
        groups: moveGroupLayouts(actualSidebarLayout.groups, nextDrag.groupId, targetSection.group.id, getVerticalDragPlacement(targetSection.bounds, point.y)),
      };

      setDragOverGroupId(targetSection.group.id);
      setPreviewSidebarLayout(sidebarLayoutsMatch(nextLayout, actualSidebarLayout) ? null : nextLayout);
      return;
    }

    const target = getInboxDropTarget(point, nextDrag.inboxId);

    setDraggedGroupId(null);
    setDraggedInboxId(nextDrag.inboxId);

    if (!target) {
      setDragOverGroupId(null);
      setDragOverInboxId(null);
      setPreviewSidebarLayout(null);
      return;
    }

    const nextLayout = moveInboxAcrossGroups(
      actualSidebarLayout,
      nextDrag.inboxId,
      target.groupId,
      target.targetInboxId,
      target.placement,
    );

    setDragOverGroupId(target.dragOverGroupId);
    setDragOverInboxId(target.dragOverInboxId);
    setPreviewSidebarLayout(sidebarLayoutsMatch(nextLayout, actualSidebarLayout) ? null : nextLayout);
  });

  const handleWindowPointerUp = useEffectEvent((event: PointerEvent) => {
    const currentDrag = pointerDragRef.current;

    if (!currentDrag || event.pointerId !== currentDrag.pointerId) {
      return;
    }

    const shouldCommit =
      currentDrag.active &&
      previewSidebarLayout !== null &&
      !sidebarLayoutsMatch(previewSidebarLayout, actualSidebarLayout);

    if (shouldCommit) {
      commitSidebarLayout(previewSidebarLayout);
      return;
    }

    clearDragState();
    setPreviewSidebarLayout(null);
  });

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => handleWindowPointerMove(event);
    const handlePointerUp = (event: PointerEvent) => handleWindowPointerUp(event);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [handleWindowPointerMove, handleWindowPointerUp]);

  useEffect(() => {
    if (!pointerDrag?.active) {
      return;
    }

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [pointerDrag?.active]);

  const syncViewport = useEffectEvent(() => {
    const viewport = viewportRef.current;

    if (!viewport || !window.mailToaster) {
      return;
    }

    const bounds = viewport.getBoundingClientRect();

    void actions.setViewport({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
  });

  useEffect(() => {
    if (!ready) {
      return;
    }

    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    let frame = 0;
    const requestSync = () => {
      cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        syncViewport();
      });
    };

    const observer = new ResizeObserver(requestSync);
    observer.observe(viewport);
    requestSync();
    window.addEventListener('resize', requestSync);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', requestSync);
    };
  }, [ready, syncViewport, selectedInbox?.id, state.inboxes.length]);

  return (
    <>
      <input
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const inboxId = iconUploadTargetId;
          event.target.value = '';

          if (!file || !inboxId) {
            return;
          }

          void prepareInboxIconDataUrl(file)
            .then((dataUrl) => actions.setInboxCustomIcon(inboxId, dataUrl))
            .then(() => {
              setSidebarNotice(null);
            })
            .catch((caughtError) => {
              setSidebarNotice(caughtError instanceof Error ? caughtError.message : 'Unable to update icon.');
            })
            .finally(() => {
              setIconUploadTargetId(null);
            });
        }}
      />

      <AppSettingsDialog
        accentThemeId={state.appearanceSettings.accentThemeId}
        open={settingsOpen}
        onAccentThemeChange={(accentThemeId) => void actions.setAccentTheme(accentThemeId)}
        onOpenChange={setSettingsOpen}
      />

      <InboxSleepDialog
        inbox={sleepDialogTarget}
        open={sleepDialogInboxId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSleepDialogInboxId(null);
          }
        }}
        onSetAutoSleep={(minutes) => {
          if (sleepDialogTarget) {
            void actions.setInboxAutoSleep(sleepDialogTarget.id, minutes);
          }
        }}
        onSleepUntilWoken={() => {
          if (sleepDialogTarget) {
            void actions.sleepInbox(sleepDialogTarget.id);
          }
        }}
        onWake={() => {
          if (sleepDialogTarget) {
            void actions.wakeInbox(sleepDialogTarget.id);
          }
        }}
      />

      <GroupSortDialog
        groups={groupSortItems}
        layout={actualSidebarLayout}
        open={groupSortOpen}
        onOpenChange={setGroupSortOpen}
        onSave={actions.saveSidebarLayout}
      />

      <InboxSidebarPanel
        groups={orderedGroups}
        panel={sidebarPanel}
        onClose={() => setPanelMode(null)}
        onCreateGroup={actions.createGroup}
        onCreateInbox={actions.createInbox}
        onRemoveGroup={actions.removeGroup}
        onRemoveInbox={actions.removeInbox}
        onRenameGroup={actions.renameGroup}
        onUpdateInbox={actions.updateInbox}
      />

      <main className="flex h-screen flex-col gap-3 p-3 pt-0">
        <div className="app-drag h-10 shrink-0" />

        <div className="flex min-h-0 flex-1 gap-3">
          <div className="relative flex shrink-0 pr-6">
            <aside
              className={cn(
                'flex shrink-0 flex-col overflow-hidden rounded-[1rem] border border-border/30 bg-card/82 shadow-soft backdrop-blur-xl transition-[width] duration-200 dark:border-border/65 dark:bg-card/74',
                sidebarCollapsed ? 'w-[92px]' : 'w-[312px]',
              )}
            >
              {!sidebarCollapsed && sidebarNotice ? (
                <div className="border-b border-border/30 p-3">
                  <div className="rounded-[1rem] border border-danger/20 bg-danger/8 px-3 py-2.5 text-sm text-danger">{sidebarNotice}</div>
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {renderedInboxes.length === 0 ? (
                  <div
                    className={cn(
                      'flex h-full items-center justify-center text-center text-sm text-muted-foreground',
                      sidebarCollapsed ? 'px-2' : 'px-6',
                    )}
                  >
                    {sidebarCollapsed ? '0' : 'No inboxes'}
                  </div>
                ) : sidebarCollapsed ? (
                  <div className="space-y-2">
                    {renderedGroupSections.map(({ group, inboxes }) => {
                      const unreadIndicator = getGroupUnreadIndicator(inboxes);
                      const hasSelectedInbox = inboxes.some((inbox) => inbox.id === selectedInbox?.id);

                      return (
                        <section
                          key={group.id}
                          className={cn(
                            'rounded-[1rem] border border-border/30 bg-background/52 p-1.5 transition',
                            hasSelectedInbox && 'border-primary/24 bg-primary/6',
                          )}
                        >
                          <button
                            className={cn(
                              'relative flex w-full items-center justify-center rounded-[0.9rem] px-1 py-2.5 transition hover:bg-accent/65',
                              hasSelectedInbox && 'bg-accent/55',
                            )}
                            title={group.name}
                            type="button"
                            onClick={() => void actions.setGroupCollapsed(group.id, !group.collapsed)}
                          >
                            <span className="flex h-10 w-10 items-center justify-center rounded-[0.95rem] border border-border/45 bg-card/82 text-primary shadow-sm">
                              <GroupIcon className="text-lg" emoji={group.emoji} groupId={group.id} iconId={group.icon} />
                            </span>
                            <span className="pointer-events-none absolute bottom-1 left-1/2 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full bg-card/90 text-muted-foreground shadow-sm">
                              <ChevronDown className={cn('h-3 w-3 transition-transform', group.collapsed && '-rotate-90')} />
                            </span>
                            {unreadIndicator ? (
                              unreadIndicator === '•' ? (
                                <span className="absolute right-1 top-1 h-3 w-3 rounded-full bg-primary shadow-[0_0_0_2px_hsl(var(--card))]" />
                              ) : (
                                <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full border border-primary/16 bg-primary-foreground px-1 py-0.5 text-[9px] font-semibold text-primary shadow-sm">
                                  {unreadIndicator}
                                </span>
                              )
                            ) : null}
                          </button>

                          {!group.collapsed ? (
                            <div className="mt-1.5 space-y-1.5 border-t border-border/25 pt-1.5">
                              {inboxes.map((inbox) => (
                                <div
                                  key={inbox.id}
                                  ref={(node) => {
                                    if (node) {
                                      rowRefs.current.set(inbox.id, node);
                                    } else {
                                      rowRefs.current.delete(inbox.id);
                                      rowTopsRef.current.delete(inbox.id);
                                    }
                                  }}
                                  className="will-change-transform"
                                >
                                  <InboxRow
                                    active={selectedInbox?.id === inbox.id}
                                    collapsed
                                    dragEnabled={false}
                                    dragOver={false}
                                    dragging={false}
                                    inbox={inbox}
                                    onOpenExternal={() => void actions.openInboxExternal(inbox.id)}
                                    onRemove={() => {
                                      setSidebarCollapsed(false);
                                      setPanelMode({ type: 'remove-inbox', inboxId: inbox.id });
                                    }}
                                    onRename={() => {
                                      setSidebarCollapsed(false);
                                      setPanelMode({ type: 'edit-inbox', inboxId: inbox.id });
                                    }}
                                    onResetIcon={() => {
                                      void actions.clearInboxCustomIcon(inbox.id);
                                      setSidebarNotice(null);
                                    }}
                                    onSelect={() => void actions.selectInbox(inbox.id)}
                                    onOpenSleepSettings={() => setSleepDialogInboxId(inbox.id)}
                                    onUploadIcon={() => {
                                      setSidebarCollapsed(false);
                                      setSidebarNotice(null);
                                      setIconUploadTargetId(inbox.id);
                                      fileInputRef.current?.click();
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {renderedGroupSections.map(({ group, inboxes }) => {
                      const unreadIndicator = getGroupUnreadIndicator(inboxes);
                      const isDefaultGroup = group.id === DEFAULT_MAILBOX_GROUP_ID;

                      return (
                        <section
                          key={group.id}
                          ref={(node) => {
                            if (node) {
                              groupSectionRefs.current.set(group.id, node);
                            } else {
                              groupSectionRefs.current.delete(group.id);
                            }
                          }}
                          className={cn(
                            'rounded-[1rem] border border-border/30 bg-background/52 p-2.5 transition',
                            dragOverGroupId === group.id && 'border-primary/28 bg-primary/6',
                            draggedGroupId === group.id && 'opacity-70',
                          )}
                        >
                          <div className="flex items-center gap-2 rounded-xl px-1.5 py-1">
                            <button
                              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-accent/65"
                              type="button"
                              onClick={() => void actions.setGroupCollapsed(group.id, !group.collapsed)}
                            >
                              <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
                                <ChevronDown className={cn('h-4 w-4 transition-transform', group.collapsed && '-rotate-90')} />
                              </span>
                              <span className="flex min-w-0 items-center gap-1.5">
                                <GroupIcon className="shrink-0 text-[15px]" emoji={group.emoji} groupId={group.id} iconId={group.icon} />
                                <span className="truncate text-sm font-semibold tracking-tight">{group.name}</span>
                              </span>
                            </button>

                            {unreadIndicator ? (
                              unreadIndicator === '•' ? (
                                <span className="mr-1 h-3 w-3 rounded-full bg-primary shadow-[0_0_0_2px_hsl(var(--card))]" />
                              ) : (
                                <Badge className="min-w-9 justify-center border border-primary/16 bg-primary-foreground px-2.5 text-[11px] text-primary shadow-none">
                                  {unreadIndicator}
                                </Badge>
                              )
                            ) : null}

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button className="h-9 w-9 rounded-md px-0" size="icon" type="button" variant="ghost">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Group actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setGroupSortOpen(true);
                                    setSidebarNotice(null);
                                  }}
                                >
                                  Sort Groups
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setPanelMode({ type: 'rename-group', groupId: group.id });
                                    setSidebarNotice(null);
                                  }}
                                >
                                  Edit Group
                                </DropdownMenuItem>
                                {!isDefaultGroup ? (
                                  <DropdownMenuItem
                                    className="text-danger focus:text-danger"
                                    onSelect={() => {
                                      setPanelMode({ type: 'remove-group', groupId: group.id });
                                      setSidebarNotice(null);
                                    }}
                                  >
                                    Remove Group
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {!group.collapsed ? (
                            <div className="mt-2 space-y-2">
                              {inboxes.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-border/40 px-3 py-4 text-center text-xs uppercase tracking-[0.12em] text-muted-foreground">
                                  Drop inboxes here
                                </div>
                              ) : (
                                inboxes.map((inbox) => (
                                  <div
                                    key={inbox.id}
                                    ref={(node) => {
                                      if (node) {
                                        rowRefs.current.set(inbox.id, node);
                                      } else {
                                        rowRefs.current.delete(inbox.id);
                                        rowTopsRef.current.delete(inbox.id);
                                      }
                                    }}
                                    className="will-change-transform"
                                  >
                                    <InboxRow
                                      active={selectedInbox?.id === inbox.id}
                                      collapsed={false}
                                      dragEnabled
                                      dragOver={dragOverInboxId === inbox.id && draggedInboxId !== inbox.id}
                                      dragging={draggedInboxId === inbox.id}
                                      inbox={inbox}
                                      onDragHandlePointerDown={(event) => beginInboxPointerDrag(event, inbox)}
                                      onOpenExternal={() => void actions.openInboxExternal(inbox.id)}
                                      onRemove={() => {
                                        setSidebarCollapsed(false);
                                        setPanelMode({ type: 'remove-inbox', inboxId: inbox.id });
                                      }}
                                      onRename={() => {
                                        setSidebarCollapsed(false);
                                        setPanelMode({ type: 'edit-inbox', inboxId: inbox.id });
                                      }}
                                      onResetIcon={() => {
                                        void actions.clearInboxCustomIcon(inbox.id);
                                        setSidebarNotice(null);
                                      }}
                                      onSelect={() => void actions.selectInbox(inbox.id)}
                                      onOpenSleepSettings={() => setSleepDialogInboxId(inbox.id)}
                                      onUploadIcon={() => {
                                        setSidebarCollapsed(false);
                                        setSidebarNotice(null);
                                        setIconUploadTargetId(inbox.id);
                                        fileInputRef.current?.click();
                                      }}
                                    />
                                  </div>
                                ))
                              )}
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className={cn('border-t border-border/30 p-3', sidebarCollapsed && 'px-2.5 py-2.5')}>
                {!sidebarCollapsed && sidebarUpdatePanel ? (
                  <div
                    className={cn(
                      'mb-3 rounded-[1rem] border px-3 py-3',
                      sidebarUpdatePanel.tone === 'danger'
                        ? 'border-danger/30 bg-danger/6'
                        : 'border-primary/20 bg-primary/6',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                          sidebarUpdatePanel.tone === 'danger' ? 'bg-danger/12 text-danger' : 'bg-primary/12 text-primary',
                        )}
                      >
                        {sidebarUpdatePanel.tone === 'danger' ? (
                          <TriangleAlert className="h-4 w-4" />
                        ) : sidebarUpdatePanel.canInstall ? (
                          <Download className="h-4 w-4" />
                        ) : (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-semibold tracking-tight">{sidebarUpdatePanel.title}</p>
                        <p className="text-xs leading-5 text-muted-foreground">{sidebarUpdatePanel.detail}</p>
                        {sidebarUpdatePanel.canInstall ? (
                          <Button
                            className="mt-2 h-9 rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
                            size="sm"
                            type="button"
                            onClick={() => void installDownloadedUpdate()}
                          >
                            Restart and Install
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className={cn('flex items-center gap-2', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
                  {!sidebarCollapsed && sidebarUpdateIndicator ? (
                    sidebarUpdateIndicator.kind === 'install' ? (
                      <Button
                        className="h-10 max-w-[172px] rounded-full border-primary/30 bg-primary/10 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary hover:bg-primary/14"
                        size="sm"
                        type="button"
                        variant="outline"
                        title={sidebarUpdateIndicator.title}
                        onClick={() => void installDownloadedUpdate()}
                      >
                        <Download className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{sidebarUpdateIndicator.label}</span>
                      </Button>
                    ) : (
                      <Badge
                        className="h-10 max-w-[172px] gap-2 rounded-full bg-primary/10 px-3 text-[10px] tracking-[0.12em] text-primary"
                        title={sidebarUpdateIndicator.title}
                        variant="muted"
                      >
                        <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" />
                        <span className="truncate">{sidebarUpdateIndicator.label}</span>
                      </Badge>
                    )
                  ) : null}

                  <div className="flex items-center gap-2">
                    {!sidebarCollapsed ? (
                      <Button
                        className="h-10 w-10 rounded-md px-0"
                        size="icon"
                        type="button"
                        title="Open appearance settings"
                        variant="outline"
                        onClick={() => setSettingsOpen(true)}
                      >
                        <Settings2 className="h-4 w-4" />
                        <span className="sr-only">Open appearance settings</span>
                      </Button>
                    ) : null}

                    {!sidebarCollapsed ? (
                      <Button
                        className="h-10 w-10 rounded-md px-0"
                        size="icon"
                        type="button"
                        title="Create group"
                        variant="outline"
                        onClick={() => {
                          setPanelMode({ type: 'add-group' });
                          setSidebarNotice(null);
                        }}
                      >
                        <FolderPlus className="h-4 w-4" />
                        <span className="sr-only">Create group</span>
                      </Button>
                    ) : null}

                    <div className="relative">
                      <Button
                        className="h-10 w-10 rounded-md px-0"
                        size="icon"
                        type="button"
                        title="Add inbox"
                        onClick={() => {
                          setSidebarCollapsed(false);
                          setPanelMode({ type: 'add-inbox' });
                          setSidebarNotice(null);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        <span className="sr-only">Add inbox</span>
                      </Button>

                      {sidebarCollapsed && sidebarUpdateIndicator ? (
                        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-primary ring-2 ring-card" aria-hidden="true" />
                      ) : null}
                    </div>

                    {!sidebarCollapsed ? (
                      <div className="flex h-10 items-center rounded-md border border-border/30 bg-background/70 px-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        {unreadSummaryText}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </aside>

            <Button
              className={cn(
                'absolute right-2.5 top-1/2 z-10 h-14 w-7 -translate-y-1/2 rounded-full border border-border/35 bg-card/96 px-0 shadow-[0_14px_34px_-20px_hsl(var(--foreground)/0.65)] backdrop-blur-xl transition hover:bg-card dark:border-border/55 dark:bg-card/94',
                sidebarCollapsed ? 'shadow-[0_16px_36px_-22px_hsl(var(--foreground)/0.75)]' : '',
              )}
              size="icon"
              type="button"
              variant="ghost"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => {
                if (sidebarCollapsed) {
                  setSidebarCollapsed(false);
                  return;
                }

                setSidebarCollapsed(true);
                setPanelMode(null);
              }}
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              <span className="sr-only">{sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
            </Button>
          </div>

          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1rem] border border-border/30 bg-card/62 shadow-soft backdrop-blur-xl dark:border-border/65 dark:bg-card/54">
            <MailboxToolbar
              actionsOpen={toolbarActionsOpen}
              inbox={selectedInbox ?? null}
              viewState={selectedViewState}
              onActionsOpenChange={setToolbarActionsOpen}
              onBack={async () => {
                if (selectedInbox) {
                  await actions.goBackInbox(selectedInbox.id);
                }
              }}
              onForward={async () => {
                if (selectedInbox) {
                  await actions.goForwardInbox(selectedInbox.id);
                }
              }}
              onHome={async () => {
                if (selectedInbox) {
                  await actions.goHomeInbox(selectedInbox.id);
                }
              }}
              onNavigate={async (url) => {
                if (selectedInbox) {
                  await actions.navigateInbox(selectedInbox.id, url);
                }
              }}
              onRefresh={async () => {
                if (selectedInbox) {
                  await actions.reloadInbox(selectedInbox.id);
                }
              }}
              onOpenExternal={() => {
                if (selectedInbox) {
                  void actions.openInboxExternal(selectedInbox.id);
                }
              }}
              onOpenSleepSettings={() => {
                if (selectedInbox) {
                  setSleepDialogInboxId(selectedInbox.id);
                }
              }}
              onRemove={() => {
                if (selectedInbox) {
                  setPanelMode({ type: 'remove-inbox', inboxId: selectedInbox.id });
                }
              }}
              onRename={() => {
                if (selectedInbox) {
                  setPanelMode({ type: 'edit-inbox', inboxId: selectedInbox.id });
                }
              }}
              onResetIcon={() => {
                if (selectedInbox) {
                  void actions.clearInboxCustomIcon(selectedInbox.id);
                  setSidebarNotice(null);
                }
              }}
              onUploadIcon={() => {
                if (selectedInbox) {
                  setSidebarNotice(null);
                  setIconUploadTargetId(selectedInbox.id);
                  fileInputRef.current?.click();
                }
              }}
            />

            <div className="relative min-h-0 flex-1 bg-white/38 dark:bg-black/18">
              <div ref={viewportRef} className="absolute inset-0 overflow-hidden">
                {!ready ? (
                  <div className="flex h-full items-center justify-center">
                    <LoaderCircle className="h-7 w-7 animate-spin text-muted-foreground" />
                  </div>
                ) : null}

                {ready && error ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                    <img src="/logo.jpg" alt="" width={72} height={72} className="rounded-[0.95rem] opacity-90" draggable={false} />
                    <div className="text-sm text-muted-foreground">{error}</div>
                  </div>
                ) : null}

                {ready && !error && !selectedInbox ? (
                  <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
                    <img src="/logo.jpg" alt="" width={88} height={88} className="rounded-[1rem]" draggable={false} />
                    <div className="text-sm text-muted-foreground">No inboxes</div>
                  </div>
                ) : null}

                {ready && !error && selectedInbox?.sleepState === 'sleeping' ? (
                  <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
                    <MailboxAvatar
                      provider={selectedInbox.provider}
                      customIconDataUrl={selectedInbox.customIconDataUrl}
                      className="h-16 w-16 rounded-[0.95rem]"
                    />
                    <div className="space-y-1">
                      <div className="text-lg font-semibold tracking-tight">{selectedInbox.displayName}</div>
                      <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MoonStar className="h-4 w-4" />
                        Sleeping
                      </div>
                    </div>
                    <Button type="button" onClick={() => void actions.wakeInbox(selectedInbox.id)}>
                      Wake
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </main>

      {pointerDrag?.active ? (
        pointerDrag.kind === 'inbox' ? (
          <div
            className="pointer-events-none fixed z-[80]"
            style={{
              left: pointerDrag.current.x - pointerDrag.offset.x,
              top: pointerDrag.current.y - pointerDrag.offset.y,
              width: pointerDrag.rect.width,
            }}
          >
            <div className="rounded-xl border border-primary/24 bg-card/96 p-1.5 shadow-[0_20px_60px_-28px_hsl(var(--foreground)/0.55)] backdrop-blur-xl">
              <div className="flex min-w-0 items-center gap-3 rounded-lg px-3 py-2">
                <MailboxAvatar
                  provider={pointerDrag.inbox.provider}
                  accountAvatarDataUrl={pointerDrag.inbox.accountAvatarDataUrl}
                  customIconDataUrl={pointerDrag.inbox.customIconDataUrl}
                  className="h-9 w-9 min-h-9 min-w-9"
                  iconClassName="h-[18px] w-[18px]"
                />
                <div className="truncate text-sm font-medium">{pointerDrag.inbox.displayName}</div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="pointer-events-none fixed z-[80]"
            style={{
              left: pointerDrag.current.x - pointerDrag.offset.x,
              top: pointerDrag.current.y - pointerDrag.offset.y,
              width: pointerDrag.rect.width,
            }}
          >
            <div className="rounded-[1rem] border border-primary/24 bg-card/96 p-2.5 shadow-[0_20px_60px_-28px_hsl(var(--foreground)/0.55)] backdrop-blur-xl">
              <div className="flex items-center gap-2 rounded-xl px-1.5 py-1">
                <span className="flex h-9 w-7 shrink-0 items-center justify-center text-muted-foreground/65">
                  <GripVertical className="h-4 w-4" />
                </span>
                <div className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left">
                  <span className="flex h-5 w-5 items-center justify-center text-primary">
                    <GroupIcon className="shrink-0 text-[15px]" emoji={pointerDrag.emoji} groupId={pointerDrag.groupId} iconId={pointerDrag.icon} />
                  </span>
                  <span className="truncate text-sm font-semibold tracking-tight">{pointerDrag.name}</span>
                </div>
              </div>
            </div>
          </div>
        )
      ) : null}
    </>
  );
}
