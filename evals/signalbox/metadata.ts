export const signalboxMetadata = (
  sequence: number,
  phase: "learn" | "checkpoint" | "update" | "interference" | "revoke",
  memoryOperation: "addition" | "retrieval" | "interference" | "update" | "scope" | "forgetting",
) => ({
  suite: "signalbox",
  simulatedTeam: "Orion Support",
  sequence,
  phase,
  memoryOperation,
  checkpoint: phase === "checkpoint",
});
