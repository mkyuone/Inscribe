export function formatDuration(ms: number) {
  if (!Number.isFinite(ms)) return "--";
  if (ms < 1000) return `${ms.toFixed(ms < 100 ? 1 : 0)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)} s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem.toFixed(1)}s`;
}
