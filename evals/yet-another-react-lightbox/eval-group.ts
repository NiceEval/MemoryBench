import { defineEvalGroup } from "niceeval";
import commit5578052 from "./commit-5578052/eval.ts";
import commitF63f6af from "./commit-f63f6af/eval.ts";
import pr408 from "./pr-408/eval.ts";

export default defineEvalGroup({
  evals: [commit5578052, commitF63f6af, pr408],
});
