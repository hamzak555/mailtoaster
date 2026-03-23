'use client';

import { startTransition, useEffect, useEffectEvent, useState } from 'react';

import type { AppUpdateState } from '@shared/ipc';

const EMPTY_APP_UPDATE_STATE: AppUpdateState = {
  phase: 'idle',
  currentVersion: '',
  availableVersion: null,
  progressPercent: null,
  detail: null,
  canInstall: false,
};

function getApi() {
  if (!window.mailToaster) {
    throw new Error('Mail Toaster is only available inside Electron.');
  }

  return window.mailToaster;
}

export function useAppUpdateState() {
  const [updateState, setUpdateState] = useState<AppUpdateState>(EMPTY_APP_UPDATE_STATE);
  const [ready, setReady] = useState(false);

  const applyState = useEffectEvent((nextState: AppUpdateState) => {
    startTransition(() => {
      setUpdateState(nextState);
      setReady(true);
    });
  });

  useEffect(() => {
    if (!window.mailToaster) {
      setReady(true);
      return;
    }

    let mounted = true;
    const unsubscribe = window.mailToaster.subscribeToAppUpdateState((nextState) => {
      if (mounted) {
        applyState(nextState);
      }
    });

    window.mailToaster
      .getAppUpdateState()
      .then((nextState) => {
        if (mounted) {
          applyState(nextState);
        }
      })
      .catch(() => {
        if (mounted) {
          setReady(true);
        }
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [applyState]);

  return {
    updateState: ready ? updateState : null,
    installDownloadedUpdate: async () => {
      await getApi().installDownloadedUpdate();
    },
  };
}
