'use client';

import { Download, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { AppUpdateState } from '@shared/ipc';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AppUpdateStatusDialogProps {
  state: AppUpdateState | null;
  onInstall: () => void;
}

function isVisiblePhase(phase: AppUpdateState['phase']) {
  return phase !== 'idle';
}

function getDialogTitle(state: AppUpdateState) {
  switch (state.phase) {
    case 'unsupported-location':
      return 'Automatic Updates Unavailable';
    case 'checking':
      return 'Checking for Updates';
    case 'downloading':
      return 'Downloading Update';
    case 'downloaded':
      return state.canInstall ? 'Update Ready' : 'Update Downloaded';
    case 'installing':
      return 'Installing Update';
    case 'error':
      return 'Update Problem';
    default:
      return 'Mail Toaster Update';
  }
}

function getDialogIcon(state: AppUpdateState) {
  if (state.phase === 'downloaded') {
    return <Download className="h-5 w-5 text-primary" />;
  }

  if (state.phase === 'unsupported-location' || state.phase === 'error') {
    return <TriangleAlert className="h-5 w-5 text-danger" />;
  }

  return <LoaderCircle className="h-5 w-5 animate-spin text-primary" />;
}

export function AppUpdateStatusDialog({ state, onInstall }: AppUpdateStatusDialogProps) {
  const visible = Boolean(state && isVisiblePhase(state.phase));
  const stateKey = useMemo(
    () => (state ? `${state.phase}:${state.availableVersion ?? ''}:${state.detail ?? ''}:${state.canInstall}` : null),
    [state],
  );
  const [dismissedStateKey, setDismissedStateKey] = useState<string | null>(null);

  useEffect(() => {
    if (!stateKey) {
      setDismissedStateKey(null);
      return;
    }

    setDismissedStateKey((currentKey) => (currentKey === stateKey ? currentKey : null));
  }, [stateKey]);

  if (!state || !visible || dismissedStateKey === stateKey) {
    return null;
  }

  const closeDialog = () => {
    if (stateKey) {
      setDismissedStateKey(stateKey);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (!open ? closeDialog() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/70">
              {getDialogIcon(state)}
            </div>
            <div className="space-y-0">
              <DialogTitle>{getDialogTitle(state)}</DialogTitle>
              <DialogDescription>
                Current version: {state.currentVersion}
                {state.availableVersion ? ` • New version: ${state.availableVersion}` : ''}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {state.detail ? <p className="text-sm text-muted-foreground">{state.detail}</p> : null}

          {state.phase === 'downloading' ? (
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-border/45">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.max(4, state.progressPercent ?? 0)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{Math.max(0, Math.round(state.progressPercent ?? 0))}% complete</p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {state.phase === 'downloaded' && state.canInstall ? (
            <>
              <Button type="button" variant="ghost" onClick={closeDialog}>
                Later
              </Button>
              <Button type="button" onClick={onInstall}>
                Restart and Install
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" onClick={closeDialog}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
