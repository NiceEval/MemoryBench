import { defineEvalGroup } from "niceeval";
import { changeFrequency, sandboxLayer, shell } from "niceeval/sandbox";
import commit5578052 from "./commit-5578052/eval.ts";
import commitF63f6af from "./commit-f63f6af/eval.ts";
import pr408 from "./pr-408/eval.ts";

const NODE_VERSION = "22.13.0";
const N_VERSION = "10.2.0";
const installNodeRuntime = shell({
  id: "yet-another-react-lightbox.install-node-runtime",
  command: [
    "set -eu",
    `npm install -g --prefix /usr/local n@${N_VERSION}`,
    `n ${NODE_VERSION}`,
    "",
    'ACTUAL=$(node -p "process.version")',
    `EXPECTED="v${NODE_VERSION}"`,
    '[ "$ACTUAL" = "$EXPECTED" ] || {',
    '  echo "expected Node $EXPECTED, got $ACTUAL" >&2',
    "  exit 1",
    "}",
  ].join("\n"),
  changeFrequency: changeFrequency.rare,
});

export default defineEvalGroup({
  onUnavailable: "stop-group",
  sandbox: sandboxLayer().before(installNodeRuntime),
  evals: [commit5578052, commitF63f6af, pr408],
});
