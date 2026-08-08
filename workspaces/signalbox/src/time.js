export function addMinutes(instant, minutes) {
  const value = new Date(instant);
  if (Number.isNaN(value.valueOf())) throw new TypeError("invalid ISO timestamp");
  return new Date(value.valueOf() + minutes * 60_000).toISOString();
}

export function compareDeadlineThenId(left, right) {
  return left.deadline.localeCompare(right.deadline) || left.id.localeCompare(right.id);
}
