import { defineEvalGroup } from "niceeval";
import pr6058 from "../evals/react-datepicker/pr-6058/eval.ts";
import pr6073 from "../evals/react-datepicker/pr-6073/eval.ts";
import pr6092 from "../evals/react-datepicker/pr-6092/eval.ts";
import pr6167 from "../evals/react-datepicker/pr-6167/eval.ts";
import pr6168 from "../evals/react-datepicker/pr-6168/eval.ts";
import pr6172 from "../evals/react-datepicker/pr-6172/eval.ts";
import pr6206 from "../evals/react-datepicker/pr-6206/eval.ts";

export default defineEvalGroup({
  evals: [pr6058, pr6073, pr6092, pr6167, pr6168, pr6172, pr6206],
});
