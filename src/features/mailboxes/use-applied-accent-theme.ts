'use client';

import { useEffect } from 'react';

import { getAppAccentTheme, type AppAccentThemeId } from '@shared/appearance';

export function useAppliedAccentTheme(accentThemeId: AppAccentThemeId) {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const theme = getAppAccentTheme(accentThemeId);
      const variables = mediaQuery.matches ? theme.dark : theme.light;
      const rootStyle = document.documentElement.style;

      for (const [name, value] of Object.entries(variables)) {
        rootStyle.setProperty(name, value);
      }
    };

    applyTheme();
    mediaQuery.addEventListener('change', applyTheme);

    return () => {
      mediaQuery.removeEventListener('change', applyTheme);
    };
  }, [accentThemeId]);
}
