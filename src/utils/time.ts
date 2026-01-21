export function formatDuration(ms: number) {
  if (!Number.isFinite(ms)) return "--";
  const rounded = ms < 100 ? ms.toFixed(1) : ms.toFixed(0);
  return `${rounded} ms`;
}
