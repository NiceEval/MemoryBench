const minutesByPriority = { P1: 5, P2: 30, P3: 240 };
const vegaMinutes = { P1: 10, P2: 45, P3: 360 };

const deadline = (incident, minutes) =>
  new Date(new Date(incident.createdAt).valueOf() + minutes * 60_000).toISOString();

const currentOrionWindow = (incident) => {
  if (incident.status !== "open") return null;
  if (incident.priority === "P2") return incident.audience === "customer" ? 20 : 30;
  return minutesByPriority[incident.priority];
};

export function orionDeadlineFor(incident) {
  return incident.status === "open" ? deadline(incident, minutesByPriority[incident.priority]) : null;
}

export function findOrionOverdue(incidents, now) {
  const cutoff = new Date(now).valueOf();
  return incidents
    .filter((incident) => incident.status === "open")
    .map((incident) => ({ id: incident.id, deadline: deadline(incident, minutesByPriority[incident.priority]) }))
    .filter((row) => new Date(row.deadline).valueOf() <= cutoff)
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.id.localeCompare(b.id))
    .map((row) => row.id);
}

export function vegaDeadlineFor(incident) {
  return incident.status === "open" ? deadline(incident, vegaMinutes[incident.priority]) : null;
}

export function orionWindowMinutes(incident) {
  return currentOrionWindow(incident);
}

export function summarizeOrionBreaches(incidents, now) {
  const result = { open: 0, breached: 0, byPriority: { P1: 0, P2: 0, P3: 0 } };
  const cutoff = new Date(now).valueOf();
  for (const incident of incidents) {
    const minutes = currentOrionWindow(incident);
    if (minutes === null) continue;
    result.open += 1;
    if (new Date(deadline(incident, minutes)).valueOf() <= cutoff) {
      result.breached += 1;
      result.byPriority[incident.priority] += 1;
    }
  }
  return result;
}

export function buildOrionEscalationQueue(incidents) {
  return incidents
    .filter((incident) => incident.status === "open")
    .map((incident) => {
      const minutes = incident.priority === "P2" && incident.audience === "customer" && incident.plan === "regulated"
        ? 10
        : currentOrionWindow(incident);
      return { id: incident.id, deadline: deadline(incident, minutes) };
    })
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.id.localeCompare(b.id));
}

export function exportOrionBreachesCsv(incidents, now) {
  const cutoff = new Date(now).valueOf();
  const rows = incidents
    .map((incident) => {
      const minutes = currentOrionWindow(incident);
      return minutes === null ? null : { id: incident.id, deadline: deadline(incident, minutes) };
    })
    .filter((row) => row && new Date(row.deadline).valueOf() <= cutoff)
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.id.localeCompare(b.id));
  return `id,deadline\n${rows.map((row) => `${row.id},${row.deadline}\n`).join("")}`;
}
