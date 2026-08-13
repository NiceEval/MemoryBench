function shifted(instant, amount) {
  const date = new Date(instant);
  date.setUTCMinutes(date.getUTCMinutes() + amount);
  return date.toISOString();
}

function originalOrion(incident) {
  switch (incident.priority) {
    case "P1": return 5;
    case "P2": return 30;
    case "P3": return 240;
  }
}

function latestOrion(incident) {
  if (incident.status === "closed") return undefined;
  switch (`${incident.priority}:${incident.audience}`) {
    case "P1:customer": case "P1:internal": return 5;
    case "P2:customer": return 20;
    case "P2:internal": return 30;
    case "P3:customer": case "P3:internal": return 240;
  }
}

export function orionDeadlineFor(incident) {
  if (incident.status === "closed") return null;
  return shifted(incident.createdAt, originalOrion(incident));
}

export function findOrionOverdue(incidents, now) {
  const rows = [];
  for (const incident of incidents) {
    if (incident.status === "closed") continue;
    const due = shifted(incident.createdAt, originalOrion(incident));
    if (due <= new Date(now).toISOString()) rows.push([due, incident.id]);
  }
  rows.sort(([dateA, idA], [dateB, idB]) => dateA.localeCompare(dateB) || idA.localeCompare(idB));
  return rows.map(([, id]) => id);
}

export function vegaDeadlineFor(incident) {
  if (incident.status === "closed") return null;
  let minutes;
  if (incident.priority === "P1") minutes = 10;
  else if (incident.priority === "P2") minutes = 45;
  else minutes = 360;
  return shifted(incident.createdAt, minutes);
}

export function orionWindowMinutes(incident) {
  return latestOrion(incident) ?? null;
}

export function summarizeOrionBreaches(incidents, now) {
  const open = incidents.filter((incident) => incident.status === "open");
  const late = open.filter((incident) => shifted(incident.createdAt, latestOrion(incident)) <= new Date(now).toISOString());
  return {
    open: open.length,
    breached: late.length,
    byPriority: Object.fromEntries(["P1", "P2", "P3"].map((priority) => [priority, late.filter((row) => row.priority === priority).length])),
  };
}

export function buildOrionEscalationQueue(incidents) {
  const output = [];
  for (const incident of incidents) {
    if (incident.status === "closed") continue;
    let minutes = latestOrion(incident);
    if (incident.priority === "P2" && incident.audience === "customer" && incident.plan === "regulated") minutes = 10;
    output.push({ id: incident.id, deadline: shifted(incident.createdAt, minutes) });
  }
  return output.sort((a, b) => a.deadline.localeCompare(b.deadline) || a.id.localeCompare(b.id));
}

export function exportOrionBreachesCsv(incidents, now) {
  const output = ["id,deadline"];
  const rows = [];
  for (const incident of incidents) {
    const minutes = latestOrion(incident);
    if (minutes === undefined) continue;
    const due = shifted(incident.createdAt, minutes);
    if (due <= new Date(now).toISOString()) rows.push({ id: incident.id, deadline: due });
  }
  rows.sort((a, b) => a.deadline.localeCompare(b.deadline) || a.id.localeCompare(b.id));
  output.push(...rows.map(({ id, deadline }) => `${id},${deadline}`));
  return `${output.join("\n")}\n`;
}
