import { defineEvalGroup } from "niceeval";
import pr1414 from "../evals/downshift/pr-1414/eval.ts";
import pr1456 from "../evals/downshift/pr-1456/eval.ts";
import pr1458 from "../evals/downshift/pr-1458/eval.ts";
import pr1484 from "../evals/downshift/pr-1484/eval.ts";
import pr1587 from "../evals/downshift/pr-1587/eval.ts";
import pr1603 from "../evals/downshift/pr-1603/eval.ts";

export default defineEvalGroup({
  evals: [pr1414, pr1456, pr1458, pr1484, pr1587, pr1603],
});
