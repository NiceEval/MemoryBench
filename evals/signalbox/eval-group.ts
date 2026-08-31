import { defineEvalGroup } from "niceeval";
import { defineSandboxCommand, registerSandboxContent, sandboxLayer } from "niceeval/sandbox";
import orionDeadline from "./01-orion-deadline/eval.ts";
import orionOverdue from "./02-orion-overdue/eval.ts";
import vegaDeadline from "./03-vega-deadline/eval.ts";
import orionCustomerUpdate from "./04-orion-customer-update/eval.ts";
import orionSummary from "./05-orion-summary/eval.ts";
import orionRegulatedException from "./06-orion-regulated-exception/eval.ts";
import orionEscalationQueue from "./07-orion-escalation-queue/eval.ts";
import orionRevokeException from "./08-orion-revoke-exception/eval.ts";
import orionBreachExport from "./09-orion-breach-export/eval.ts";

const starter = registerSandboxContent(new URL("../../workspaces/signalbox/", import.meta.url));
const prepareStarter = defineSandboxCommand(
  {
    id: "memorybench.signalbox.starter",
    revision: "1",
    inputs: { starter },
  },
  async (sandbox, ctx) => {
    ctx.progress({ message: "uploading the Signalbox starter repository" });
    await sandbox.putContent(starter, ".");
    const baseline = await sandbox.runCommand("npm", ["test"]);
    if (baseline.exitCode !== 0) {
      throw new Error(`Signalbox baseline tests failed: ${baseline.stderr || baseline.stdout}`);
    }
  },
);

export default defineEvalGroup({
  onUnavailable: "stop-group",
  sandbox: sandboxLayer().before(prepareStarter),
  evals: [
    orionDeadline,
    orionOverdue,
    vegaDeadline,
    orionCustomerUpdate,
    orionSummary,
    orionRegulatedException,
    orionEscalationQueue,
    orionRevokeException,
    orionBreachExport,
  ],
});
