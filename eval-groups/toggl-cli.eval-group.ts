import { defineEvalGroup } from "niceeval";
import entryStats from "../evals/toggl-cli/01-entry-stats/eval.ts";
import entryBill from "../evals/toggl-cli/02-entry-bill/eval.ts";
import entryBillWeekly from "../evals/toggl-cli/03-entry-bill-weekly/eval.ts";
import billingDoc from "../evals/toggl-cli/04-billing-doc/eval.ts";
import entryInvoice from "../evals/toggl-cli/05-entry-invoice/eval.ts";
import entryInvoiceMonthly from "../evals/toggl-cli/06-entry-invoice-monthly/eval.ts";

export default defineEvalGroup({
  evals: [entryStats, entryBill, entryBillWeekly, billingDoc, entryInvoice, entryInvoiceMonthly],
});
