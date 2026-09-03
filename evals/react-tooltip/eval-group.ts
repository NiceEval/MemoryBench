import { defineEvalGroup } from "niceeval";
import { changeFrequency, sandboxLayer, shell } from "niceeval/sandbox";
import pr970 from "./pr-970/eval.ts";
import pr1269 from "./pr-1269/eval.ts";
import pr1271 from "./pr-1271/eval.ts";
import pr1275 from "./pr-1275/eval.ts";
import pr1278 from "./pr-1278/eval.ts";
import pr1282 from "./pr-1282/eval.ts";

const YARN_VERSION = "1.22.22";
const installYarn = shell({
  id: "react-tooltip.install-yarn",
  command: `npm install -g --prefix /usr/local yarn@${YARN_VERSION}`,
  changeFrequency: changeFrequency.rare,
});

export default defineEvalGroup({
  onUnavailable: "stop-group",
  sandbox: sandboxLayer().before(installYarn),
  evals: [pr970, pr1269, pr1271, pr1275, pr1278, pr1282],
});
