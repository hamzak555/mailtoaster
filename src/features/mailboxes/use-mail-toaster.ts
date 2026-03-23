'use client';

import { startTransition, useEffect, useEffectEvent, useMemo, useState } from 'react';

import { DEFAULT_APP_APPEARANCE_SETTINGS, type AppAccentThemeId } from '@shared/appearance';
import type { MailboxRecord } from '@shared/mailboxes';
import type { CreateMailboxInput, MailToasterState, MailboxViewport } from '@shared/ipc';

const EMPTY_STATE: MailToasterState = {
  inboxes: [],
  selectedInboxId: null,
  viewStates: {},
  appearanceSettings: DEFAULT_APP_APPEARANCE_SETTINGS,
};

function getApi() {
  if (!window.mailToaster) {
    throw new Error('Mail Toaster is only available inside Electron.');
  }

  return window.mailToaster;
}

export function useMailToaster() {
  const [state, setState] = useState<MailToasterState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyState = useEffectEvent((nextState: MailToasterState) => {
    startTransition(() => {
      setState(nextState);
      setReady(true);
      setError(null);
    });
  });

  useEffect(() => {
    if (!window.mailToaster) {
      setReady(true);
      setError('Electron preload not found.');
      return;
    }

    let mounted = true;
    const unsubscribe = window.mailToaster.subscribe((nextState) => {
      if (mounted) {
        applyState(nextState);
      }
    });

    window.mailToaster
      .getState()
      .then((nextState) => {
        if (mounted) {
          applyState(nextState);
        }
      })
      .catch((caughtError: unknown) => {
        if (mounted) {
          setReady(true);
          setError(caughtError instanceof Error ? caughtError.message : 'Unable to load Mail Toaster.');
        }
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [applyState]);

  const selectedInbox = useMemo<MailboxRecord | undefined>(
    () => state.inboxes.find((inbox) => inbox.id === state.selectedInboxId),
    [state.inboxes, state.selectedInboxId],
  );

  const actions = useMemo(
    () => ({
      setAccentTheme: async (accentThemeId: AppAccentThemeId) => {
        await getApi().setAccentTheme(accentThemeId);
      },
      setNativeOverlayVisible: async (visible: boolean) => {
        await getApi().setNativeOverlayVisible(visible);
      },
      createInbox: async (input: CreateMailboxInput) => {
        await getApi().createInbox(input);
      },
      reorderInboxes: async (orderedInboxIds: string[]) => {
        await getApi().reorderInboxes(orderedInboxIds);
      },
      setInboxCustomIcon: async (id: string, customIconDataUrl: string) => {
        await getApi().setInboxCustomIcon(id, customIconDataUrl);
      },
      clearInboxCustomIcon: async (id: string) => {
        await getApi().clearInboxCustomIcon(id);
      },
      renameInbox: async (id: string, displayName: string) => {
        await getApi().renameInbox(id, displayName);
      },
      removeInbox: async (id: string) => {
        await getApi().removeInbox(id);
      },
      selectInbox: async (id: string) => {
        await getApi().selectInbox(id);
      },
      sleepInbox: async (id: string) => {
        await getApi().sleepInbox(id);
      },
      wakeInbox: async (id: string) => {
        await getApi().wakeInbox(id);
      },
      openInboxExternal: async (id: string) => {
        await getApi().openInboxExternal(id);
      },
      goBackInbox: async (id: string) => {
        await getApi().goBackInbox(id);
      },
      goForwardInbox: async (id: string) => {
        await getApi().goForwardInbox(id);
      },
      reloadInbox: async (id: string) => {
        await getApi().reloadInbox(id);
      },
      goHomeInbox: async (id: string) => {
        await getApi().goHomeInbox(id);
      },
      navigateInbox: async (id: string, url: string) => {
        await getApi().navigateInbox(id, url);
      },
      setViewport: async (viewport: MailboxViewport) => {
        await getApi().setViewport(viewport);
      },
    }),
    [],
  );

  return {
    state,
    selectedInbox,
    ready,
    error,
    actions,
  };
}
