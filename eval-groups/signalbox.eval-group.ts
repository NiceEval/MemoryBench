import { defineEvalGroup } from "niceeval";
import orionDeadline from "../evals/signalbox/01-orion-deadline/eval.ts";
import orionOverdue from "../evals/signalbox/02-orion-overdue/eval.ts";
import vegaDeadline from "../evals/signalbox/03-vega-deadline/eval.ts";
import orionCustomerUpdate from "../evals/signalbox/04-orion-customer-update/eval.ts";
import orionSummary from "../evals/signalbox/05-orion-summary/eval.ts";
import orionRegulatedException from "../evals/signalbox/06-orion-regulated-exception/eval.ts";
import orionEscalationQueue from "../evals/signalbox/07-orion-escalation-queue/eval.ts";
import orionRevokeException from "../evals/signalbox/08-orion-revoke-exception/eval.ts";
import orionBreachExport from "../evals/signalbox/09-orion-breach-export/eval.ts";
import { signalboxSandbox } from "../evals/signalbox/harness.ts";

export default defineEvalGroup({
  sandbox: signalboxSandbox(),
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
