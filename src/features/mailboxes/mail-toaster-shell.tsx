'use client';

import { ChevronLeft, ChevronRight, Download, LoaderCircle, MoonStar, Plus, TriangleAlert } from 'lucide-react';
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { getAggregateUnreadCount, hasAggregateUnreadDot } from '@shared/mailboxes';
import type { AppUpdateState } from '@shared/ipc';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { AppSettingsDialog } from './app-settings-dialog';
import { InboxRow } from './inbox-row';
import { InboxSidebarPanel, type SidebarPanelState } from './inbox-sidebar-panel';
import { MailboxToolbar } from './mailbox-toolbar';
import { MailboxAvatar } from './provider-presentation';
import { useAppliedAccentTheme } from './use-applied-accent-theme';
import { useAppUpdateState } from './use-app-update-state';
import { useMailToaster } from './use-mail-toaster';

const ICON_EXPORT_SIZE = 160;

type SidebarPanelMode = { type: 'add' } | { type: 'rename'; inboxId: string } | { type: 'remove'; inboxId: string };

type DragPlacement = 'before' | 'after';

function reorderInboxIds(inboxIds: string[], sourceId: string, targetId: string, placement: DragPlacement) {
  if (sourceId === targetId) {
    return inboxIds;
  }

  const sourceIndex = inboxIds.indexOf(sourceId);
  const targetIndex = inboxIds.indexOf(targetId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return inboxIds;
  }

  const nextInboxIds = [...inboxIds];
  const [movedInboxId] = nextInboxIds.splice(sourceIndex, 1);
  const adjustedTargetIndex = nextInboxIds.indexOf(targetId);

  if (adjustedTargetIndex === -1) {
    return inboxIds;
  }

  const insertionIndex = placement === 'after' ? adjustedTargetIndex + 1 : adjustedTargetIndex;

  nextInboxIds.splice(insertionIndex, 0, movedInboxId);

  return nextInboxIds;
}

function inboxOrderMatches(left: string[], right: string[]) {
  return left.join('|') === right.join('|');
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
        title: 'Move app to Applications',
        detail: state.detail ?? 'Automatic updates only install reliably from /Applications.',
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [panelMode, setPanelMode] = useState<SidebarPanelMode | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draggedInboxId, setDraggedInboxId] = useState<string | null>(null);
  const [dragOverInboxId, setDragOverInboxId] = useState<string | null>(null);
  const [previewInboxOrderIds, setPreviewInboxOrderIds] = useState<string[] | null>(null);
  const [iconUploadTargetId, setIconUploadTargetId] = useState<string | null>(null);
  const [sidebarNotice, setSidebarNotice] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const rowTopsRef = useRef(new Map<string, number>());
  const flipFrameRef = useRef<number | null>(null);
  const reorderCommittedRef = useRef(false);

  const renameTarget =
    panelMode?.type === 'rename' ? state.inboxes.find((inbox) => inbox.id === panelMode.inboxId) ?? null : null;
  const removeTarget =
    panelMode?.type === 'remove' ? state.inboxes.find((inbox) => inbox.id === panelMode.inboxId) ?? null : null;
  const totalUnreadCount = getAggregateUnreadCount(state.inboxes);
  const hasUnreadDot = hasAggregateUnreadDot(state.inboxes);
  const actualInboxOrderIds = useMemo(() => state.inboxes.map((inbox) => inbox.id), [state.inboxes]);
  const renderedInboxes = useMemo(() => {
    if (!previewInboxOrderIds) {
      return state.inboxes;
    }

    const inboxById = new Map(state.inboxes.map((inbox) => [inbox.id, inbox]));

    return previewInboxOrderIds
      .map((inboxId) => inboxById.get(inboxId))
      .filter((inbox): inbox is (typeof state.inboxes)[number] => Boolean(inbox));
  }, [previewInboxOrderIds, state.inboxes]);
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

  useAppliedAccentTheme(state.appearanceSettings.accentThemeId);

  const sidebarPanel: SidebarPanelState | null =
    panelMode?.type === 'add'
      ? { type: 'add' }
      : panelMode?.type === 'rename' && renameTarget
        ? { type: 'rename', inbox: renameTarget }
        : panelMode?.type === 'remove' && removeTarget
          ? { type: 'remove', inbox: removeTarget }
          : null;

  useEffect(() => {
    if ((panelMode?.type === 'rename' && !renameTarget) || (panelMode?.type === 'remove' && !removeTarget)) {
      setPanelMode(null);
    }
  }, [panelMode, removeTarget, renameTarget]);

  useEffect(() => {
    if (!previewInboxOrderIds) {
      return;
    }

    const previewOrderKey = previewInboxOrderIds.join('|');
    const actualOrderKey = actualInboxOrderIds.join('|');

    if (previewOrderKey === actualOrderKey) {
      reorderCommittedRef.current = false;
      setPreviewInboxOrderIds(null);
      return;
    }

    if (!draggedInboxId && !reorderCommittedRef.current) {
      setPreviewInboxOrderIds(null);
    }
  }, [actualInboxOrderIds, draggedInboxId, previewInboxOrderIds]);

  useEffect(() => {
    void actions.setNativeOverlayVisible(settingsOpen);

    return () => {
      void actions.setNativeOverlayVisible(false);
    };
  }, [actions, settingsOpen]);

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

  const handleReorder = async (orderedInboxIds: string[]) => {
    if (inboxOrderMatches(orderedInboxIds, actualInboxOrderIds)) {
      return;
    }

    await actions.reorderInboxes(orderedInboxIds);
  };

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
              <div className={cn('border-b border-border/30 p-3', sidebarCollapsed && 'px-2.5')}>
                <div className={cn('flex items-center gap-3', sidebarCollapsed ? 'justify-center' : 'justify-start')}>
                  <div className={cn('flex min-w-0 items-center gap-3', sidebarCollapsed && 'justify-center')}>
                    <img src="/logo.jpg" alt="Mail Toaster" width={42} height={42} className="rounded-[0.8rem] object-cover" draggable={false} />
                    {!sidebarCollapsed ? (
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold tracking-tight">Mail Toaster</div>
                        <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                          {unreadSummaryText}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {!sidebarCollapsed && (sidebarPanel || sidebarNotice) ? (
                  <div className="mt-3">
                    <InboxSidebarPanel
                      panel={sidebarPanel}
                      onClose={() => setPanelMode(null)}
                      onCreate={actions.createInbox}
                      onRemove={actions.removeInbox}
                      onRename={actions.renameInbox}
                    />

                    {sidebarNotice ? <p className={cn(sidebarPanel ? 'mt-3' : '', 'text-sm text-danger')}>{sidebarNotice}</p> : null}
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {state.inboxes.length === 0 ? (
                  <div
                    className={cn(
                      'flex h-full items-center justify-center text-center text-sm text-muted-foreground',
                      sidebarCollapsed ? 'px-2' : 'px-6',
                    )}
                  >
                    {sidebarCollapsed ? '0' : 'No inboxes'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {renderedInboxes.map((inbox) => (
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
                          collapsed={sidebarCollapsed}
                          dragOver={dragOverInboxId === inbox.id && draggedInboxId !== inbox.id}
                          dragging={draggedInboxId === inbox.id}
                          inbox={inbox}
                          onDragEnd={() => {
                            setDraggedInboxId(null);
                            setDragOverInboxId(null);

                            if (reorderCommittedRef.current) {
                              return;
                            }

                            setPreviewInboxOrderIds(null);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();

                            if (!draggedInboxId || draggedInboxId === inbox.id) {
                              return;
                            }

                            const bounds = event.currentTarget.getBoundingClientRect();
                            const placement: DragPlacement = event.clientY >= bounds.top + bounds.height / 2 ? 'after' : 'before';

                            setDragOverInboxId(inbox.id);
                            setPreviewInboxOrderIds((currentInboxOrderIds) => {
                              const baseInboxOrderIds = currentInboxOrderIds ?? actualInboxOrderIds;
                              const nextInboxOrderIds = reorderInboxIds(baseInboxOrderIds, draggedInboxId, inbox.id, placement);
                              return nextInboxOrderIds.join('|') === (currentInboxOrderIds ?? actualInboxOrderIds).join('|')
                                ? baseInboxOrderIds
                                : nextInboxOrderIds;
                            });
                          }}
                          onDragStart={(event) => {
                            reorderCommittedRef.current = false;
                            setDraggedInboxId(inbox.id);
                            setPreviewInboxOrderIds(actualInboxOrderIds);
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', inbox.id);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const sourceId = event.dataTransfer.getData('text/plain') || draggedInboxId;
                            const baseInboxOrderIds = previewInboxOrderIds ?? actualInboxOrderIds;

                            if (!sourceId) {
                              setDraggedInboxId(null);
                              setDragOverInboxId(null);
                              setPreviewInboxOrderIds(null);
                              return;
                            }

                            if (sourceId === inbox.id) {
                              if (inboxOrderMatches(baseInboxOrderIds, actualInboxOrderIds)) {
                                setDraggedInboxId(null);
                                setDragOverInboxId(null);
                                setPreviewInboxOrderIds(null);
                                return;
                              }

                              reorderCommittedRef.current = true;
                              setPreviewInboxOrderIds(baseInboxOrderIds);

                              void handleReorder(baseInboxOrderIds).catch(() => {
                                reorderCommittedRef.current = false;
                                setPreviewInboxOrderIds(null);
                              });

                              return;
                            }

                            const bounds = event.currentTarget.getBoundingClientRect();
                            const placement: DragPlacement = event.clientY >= bounds.top + bounds.height / 2 ? 'after' : 'before';

                            reorderCommittedRef.current = true;
                            const nextInboxOrderIds = reorderInboxIds(baseInboxOrderIds, sourceId, inbox.id, placement);
                            setPreviewInboxOrderIds(nextInboxOrderIds);

                            void handleReorder(nextInboxOrderIds).catch(() => {
                              reorderCommittedRef.current = false;
                              setPreviewInboxOrderIds(null);
                            });
                          }}
                          onOpenExternal={() => void actions.openInboxExternal(inbox.id)}
                          onRemove={() => {
                            setSidebarCollapsed(false);
                            setPanelMode({ type: 'remove', inboxId: inbox.id });
                          }}
                          onRename={() => {
                            setSidebarCollapsed(false);
                            setPanelMode({ type: 'rename', inboxId: inbox.id });
                          }}
                          onResetIcon={() => {
                            void actions.clearInboxCustomIcon(inbox.id);
                            setSidebarNotice(null);
                          }}
                          onSelect={() => void actions.selectInbox(inbox.id)}
                          onToggleSleep={() =>
                            void (inbox.sleepState === 'sleeping' ? actions.wakeInbox(inbox.id) : actions.sleepInbox(inbox.id))
                          }
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
                  <div className="relative">
                    <Button
                      className="h-10 w-10 rounded-md px-0"
                      size="icon"
                      type="button"
                      title="Add inbox"
                      onClick={() => {
                        setSidebarCollapsed(false);
                        setPanelMode({ type: 'add' });
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
                </div>
              </div>
            </aside>

            <Button
              className={cn(
                'absolute right-2 top-1/2 z-10 h-14 w-7 -translate-y-1/2 rounded-full border border-border/35 bg-card/96 px-0 shadow-[0_14px_34px_-20px_hsl(var(--foreground)/0.65)] backdrop-blur-xl transition hover:bg-card dark:border-border/55 dark:bg-card/94',
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
              inbox={selectedInbox ?? null}
              viewState={selectedViewState}
              onOpenSettings={() => setSettingsOpen(true)}
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
    </>
  );
}
