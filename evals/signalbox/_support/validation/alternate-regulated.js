export function orionWindowMinutes(incident) {
  if (incident.status === "closed") return null;
  switch (incident.priority) {
    case "P1": return 5;
    case "P3": return 240;
    case "P2":
      if (incident.audience === "internal") return 30;
      if (incident.plan === "regulated") return 10;
      return 20;
  }
}
