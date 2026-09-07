import React, { useEffect, useState } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';

/**
 * How long something has been running, in the shortest form that stays readable.
 *
 * Under an hour it's MM:SS — a kitchen ticket lives and dies in minutes, and seconds ticking
 * are what make a stalled one obvious. Past an hour seconds stop meaning anything and the
 * count would just get wider ("142:07"), so it switches to "2h 22m": a dine-in table can sit
 * for a whole evening, and "how long have they been here" is the only question it answers.
 */
export const fmtElapsed = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  if (h > 0) return `${h}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Live elapsed time since `since`, ticking inside this one leaf component rather than from a
 * screen-level clock. That distinction is the whole point of it being its own component: a
 * per-screen `setNow` tick re-renders every card once a second, which was the KDS's single
 * biggest render cost before this. Only this Text re-renders per second.
 */
export const ElapsedTimer = React.memo(
  ({ since, style }: { since: string; style?: StyleProp<TextStyle> }) => {
    const [, setTick] = useState(0);
    useEffect(() => {
      const t = setInterval(() => setTick((n) => n + 1), 1000);
      return () => clearInterval(t);
    }, []);
    return <Text style={style}>{fmtElapsed(Date.now() - new Date(since).getTime())}</Text>;
  },
);
