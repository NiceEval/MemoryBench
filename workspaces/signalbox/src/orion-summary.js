export function summarizeOrionBreaches(_incidents, _now) {
  return { open: 0, breached: 0, byPriority: { P1: 0, P2: 0, P3: 0 } };
}
