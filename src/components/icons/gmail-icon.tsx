import { cn } from '@/lib/utils';

export function GmailIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-5 w-5', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="4" fill="#fff" />
      <path d="M4.5 7.5 12 13l7.5-5.5" stroke="#EA4335" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 17.5V8.4" stroke="#34A853" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M19.5 17.5V8.4" stroke="#4285F4" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M4.5 17.5h15" stroke="#FBBC05" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
