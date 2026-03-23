import { cn } from '@/lib/utils';

export function OutlookIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-5 w-5', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#0F6CBD" />
      <rect x="6.25" y="7.5" width="11.5" height="9" rx="2.25" fill="#fff" />
      <path d="M7.8 9.2 12 12.1l4.2-2.9" stroke="#0F6CBD" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.4 15.7h9.2" stroke="#CCE3F7" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
