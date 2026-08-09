import { defineEvalGroup } from "niceeval";
import { sandboxLayer } from "niceeval/sandbox";
import entryStats from "./01-entry-stats/eval.ts";
import entryBill from "./02-entry-bill/eval.ts";
import entryBillWeekly from "./03-entry-bill-weekly/eval.ts";
import billingDoc from "./04-billing-doc/eval.ts";
import entryInvoice from "./05-entry-invoice/eval.ts";
import entryInvoiceMonthly from "./06-entry-invoice-monthly/eval.ts";
import { installRustToolchain } from "./harness.ts";

export default defineEvalGroup({
  sandbox: sandboxLayer().setup(installRustToolchain),
  evals: [entryStats, entryBill, entryBillWeekly, billingDoc, entryInvoice, entryInvoiceMonthly],
});
