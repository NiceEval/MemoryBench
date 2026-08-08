import { defineEvalGroup } from "niceeval";
import pr970 from "../evals/react-tooltip/pr-970/eval.ts";
import pr1269 from "../evals/react-tooltip/pr-1269/eval.ts";
import pr1271 from "../evals/react-tooltip/pr-1271/eval.ts";
import pr1275 from "../evals/react-tooltip/pr-1275/eval.ts";
import pr1278 from "../evals/react-tooltip/pr-1278/eval.ts";
import pr1282 from "../evals/react-tooltip/pr-1282/eval.ts";

export default defineEvalGroup({
  evals: [pr970, pr1269, pr1271, pr1275, pr1278, pr1282],
});
