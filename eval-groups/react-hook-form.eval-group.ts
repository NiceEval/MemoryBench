import { defineEvalGroup } from "niceeval";
import pr13476 from "../evals/react-hook-form/pr-13476/eval.ts";
import pr13512 from "../evals/react-hook-form/pr-13512/eval.ts";
import pr13515 from "../evals/react-hook-form/pr-13515/eval.ts";
import pr13566 from "../evals/react-hook-form/pr-13566/eval.ts";
import pr13579 from "../evals/react-hook-form/pr-13579/eval.ts";
import pr13594 from "../evals/react-hook-form/pr-13594/eval.ts";
import pr13599 from "../evals/react-hook-form/pr-13599/eval.ts";
import pr13603 from "../evals/react-hook-form/pr-13603/eval.ts";

export default defineEvalGroup({
  evals: [pr13476, pr13512, pr13515, pr13566, pr13579, pr13594, pr13599, pr13603],
});
