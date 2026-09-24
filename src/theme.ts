// Shared palette. Lives here rather than in a screen because the balance
// screen, the generate screen and the date picker all draw from it.
export const GOLD = '#d4a437';

export const C = {
  bg: '#0b0912',
  surface: '#15111f',
  raised: '#1c1729',
  border: '#2a2340',
  borderSoft: '#231d36',
  text: '#ffffff',
  muted: '#9a8db5',
  dim: '#6b6189',
  green: '#4ade80',
  greenDim: '#132a1d',
  red: '#f87171',
  redDim: '#2b1618',
  blue: '#38bdf8',
};

// Local calendar date as YYYY-MM-DD. Never toISOString(), which converts to UTC
// and lands on the wrong day for anyone behind it.
export function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
