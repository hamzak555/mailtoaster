import { cn } from '@/lib/utils';

export function ProtonmailIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-5 w-5', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="10" fill="url(#protonmail-icon-gradient)" />
      <path
        d="M7.25 16.75V8.7c0-.8.65-1.45 1.45-1.45h4.2c2.02 0 3.35 1.28 3.35 3.08 0 1.94-1.46 3.16-3.74 3.16H10.1v3.26H7.25Z"
        fill="#fff"
      />
      <path d="M10.1 11.3h2.17c.88 0 1.33-.34 1.33-.96 0-.58-.4-.92-1.12-.92H10.1v1.88Z" fill="#6D4AFF" />
      <defs>
        <linearGradient id="protonmail-icon-gradient" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6D4AFF" />
          <stop offset="1" stopColor="#00D4FF" />
        </linearGradient>
      </defs>
    </svg>
  );
}
