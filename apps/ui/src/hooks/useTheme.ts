import { useState, useEffect, useCallback } from 'react';

type Theme = 'system' | 'light' | 'dark';

function getEffective(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('hap-theme');
    return (stored === 'light' || stored === 'dark') ? stored : 'system';
  });

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(() =>
    getEffective(theme)
  );

  // Apply data-theme attribute on <html> element and track effective theme
  useEffect(() => {
    const el = document.documentElement;
    const eff = getEffective(theme);

    // Always set data-theme so CSS [data-theme="dark"] selectors work
    el.setAttribute('data-theme', eff);

    if (theme === 'system') {
      localStorage.removeItem('hap-theme');
    } else {
      localStorage.setItem('hap-theme', theme);
    }

    setEffectiveTheme(getEffective(theme));
  }, [theme]);

  // Listen for system changes when in system mode
  useEffect(() => {
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setEffectiveTheme(getEffective('system'));
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme(prev => {
      if (prev === 'system') return 'light';
      if (prev === 'light') return 'dark';
      return 'system';
    });
  }, []);

  return { theme, effectiveTheme, toggle };
}
