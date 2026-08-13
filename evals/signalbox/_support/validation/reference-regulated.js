export function orionWindowMinutes(incident) {
  if (incident.status !== "open") return null;
  if (incident.priority === "P1") return 5;
  if (incident.priority === "P3") return 240;
  if (incident.audience === "internal") return 30;
  return incident.plan === "regulated" ? 10 : 20;
}
