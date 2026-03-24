import type { Metadata } from 'next';

import { APP_NAME } from '@shared/mailboxes';

import './globals.css';

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'Minimal multi-inbox shell for Gmail, Outlook, and Protonmail on macOS.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
