'use client';

import { Check, Clock3, MoonStar, Zap } from 'lucide-react';

import { AUTO_SLEEP_MINUTES_OPTIONS, formatAutoSleepLabel, type MailboxRecord } from '@shared/mailboxes';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface InboxSleepDialogProps {
  inbox: MailboxRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetAutoSleep: (minutes: number | null) => void;
  onSleepUntilWoken: () => void;
  onWake: () => void;
}

function getSleepStatus(inbox: MailboxRecord) {
  if (inbox.sleepState === 'sleeping') {
    return inbox.sleepMode === 'inactivity' && inbox.sleepAfterMinutes
      ? `Sleeping. Auto-sleep remains set to ${formatAutoSleepLabel(inbox.sleepAfterMinutes)}.`
      : 'Sleeping until you wake it.';
  }

  return inbox.sleepMode === 'inactivity' && inbox.sleepAfterMinutes
    ? `Awake. It will auto-sleep after ${formatAutoSleepLabel(inbox.sleepAfterMinutes)} of inactivity.`
    : 'Awake. Auto-sleep is off.';
}

export function InboxSleepDialog({
  inbox,
  open,
  onOpenChange,
  onSetAutoSleep,
  onSleepUntilWoken,
  onWake,
}: InboxSleepDialogProps) {
  if (!inbox) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[32rem]">
        <DialogHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/80 text-primary">
              <MoonStar className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <DialogTitle>Sleep</DialogTitle>
              <DialogDescription>{inbox.displayName}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-[1.1rem] border border-border/55 bg-card/72 px-4 py-3">
            <p className="text-sm font-medium tracking-tight">{getSleepStatus(inbox)}</p>
          </div>

          <button
            className={cn(
              'group w-full rounded-[1.1rem] border p-4 text-left transition hover:border-primary/40 hover:bg-accent/35',
              inbox.sleepState === 'sleeping' ? 'border-primary bg-accent/50 shadow-soft' : 'border-border/55 bg-card/72',
            )}
            type="button"
            onClick={inbox.sleepState === 'sleeping' ? onWake : onSleepUntilWoken}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <MoonStar className="h-4 w-4 text-primary" />
                  Sleep Until Woken
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {inbox.sleepState === 'sleeping'
                    ? 'Checked on. Turn it off to wake this inbox.'
                    : 'Turn it on to keep this inbox asleep until you switch it off.'}
                </p>
              </div>

              <div
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                  inbox.sleepState === 'sleeping' ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 text-transparent',
                )}
              >
                <Check className="h-3.5 w-3.5" />
              </div>
            </div>
          </button>

          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              Auto-Sleep
            </div>

            <div className="rounded-[1.1rem] border border-border/55 bg-card/72 p-3">
              <Select
                value={inbox.sleepMode === 'inactivity' && inbox.sleepAfterMinutes ? String(inbox.sleepAfterMinutes) : 'off'}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  onSetAutoSleep(nextValue === 'off' ? null : Number(nextValue));
                }}
              >
                <option value="off">No Auto-Sleep</option>
                {AUTO_SLEEP_MINUTES_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    After {formatAutoSleepLabel(minutes)}
                  </option>
                ))}
              </Select>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Choose when this inbox should sleep automatically after inactivity.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="justify-between">
          <div>
            {inbox.sleepState === 'sleeping' ? (
              <Button type="button" variant="outline" onClick={onWake}>
                <Zap className="h-4 w-4" />
                Wake Now
              </Button>
            ) : null}
          </div>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
