import type { MailToasterApi } from '@shared/ipc';

declare global {
  interface Window {
    mailToaster?: MailToasterApi;
  }
}

export {};
