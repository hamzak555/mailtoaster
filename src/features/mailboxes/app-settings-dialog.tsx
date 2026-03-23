'use client';

import { Check, Palette } from 'lucide-react';

import { APP_ACCENT_THEMES, type AppAccentThemeId } from '@shared/appearance';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface AppSettingsDialogProps {
  accentThemeId: AppAccentThemeId;
  open: boolean;
  onAccentThemeChange: (accentThemeId: AppAccentThemeId) => void;
  onOpenChange: (open: boolean) => void;
}

export function AppSettingsDialog({
  accentThemeId,
  open,
  onAccentThemeChange,
  onOpenChange,
}: AppSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[34rem]">
        <DialogHeader className="pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/80 text-primary">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Appearance</DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {APP_ACCENT_THEMES.map((theme) => {
            const selected = theme.id === accentThemeId;

            return (
              <button
                key={theme.id}
                className={cn(
                  'group rounded-[1.1rem] border p-3 text-left transition hover:border-primary/40 hover:bg-accent/35',
                  selected ? 'border-primary bg-accent/50 shadow-soft' : 'border-border/55 bg-card/72',
                )}
                type="button"
                onClick={() => onAccentThemeChange(theme.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold tracking-tight">{theme.label}</div>
                    <p className="text-xs text-muted-foreground">{theme.description}</p>
                  </div>

                  <div
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                      selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 text-transparent',
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span
                    className="h-7 w-7 rounded-full border border-white/50 shadow-sm"
                    style={{ backgroundColor: `hsl(${theme.light['--primary']})` }}
                  />
                  <span
                    className="h-5 w-5 rounded-full border border-white/50 shadow-sm"
                    style={{ backgroundColor: `hsl(${theme.light['--accent']})` }}
                  />
                  <span
                    className="h-5 w-5 rounded-full border border-white/50 shadow-sm"
                    style={{ backgroundColor: `hsl(${theme.dark['--primary']})` }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
