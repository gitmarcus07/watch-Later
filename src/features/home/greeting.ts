import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

export function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning.';
  if (hour >= 12 && hour < 17) return 'Good afternoon.';
  if (hour >= 17 && hour < 21) return 'Good evening.';
  return 'Good night.';
}

function msUntilNextBoundary(now: Date): number {
  const boundaries = [5, 12, 17, 21];
  const current = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const next = boundaries.find((hour) => hour > current) ?? 29;
  const target = new Date(now);
  target.setHours(next % 24, 0, 0, 0);
  if (next >= 24) target.setDate(target.getDate() + 1);
  return Math.max(target.getTime() - now.getTime(), 60_000);
}

/** Device-local greeting that refreshes on focus, foreground, and time boundaries. */
export function useGreeting(): string {
  const [greeting, setGreeting] = useState(() => getGreeting(new Date()));
  const refresh = useCallback(() => setGreeting(getGreeting(new Date())), []);

  useFocusEffect(refresh);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, msUntilNextBoundary(new Date()));
    };
    schedule();
    return () => { if (timer) clearTimeout(timer); };
  }, [refresh]);

  return greeting;
}
