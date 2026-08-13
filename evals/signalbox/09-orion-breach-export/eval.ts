import { defineEval } from "niceeval";
import { signalboxMetadata } from "../metadata.ts";
import { runVerifier } from "../verifier.ts";

// 契约表：复用 08 最新 Orion policy（例外已撤销）与 01 UTC/排序；不得复活 06 stale 规则。
export default defineEval({
  description: "signalbox 09 检查点：导出违约事件且不复活过期规则",
  tags: ["signalbox", "longitudinal", "memory-checkpoint", "memory-forgetting"],
  metadata: signalboxMetadata(9, "checkpoint", "forgetting"),
  async test(t) {
    await t.send(
      "请实现 `src/orion-breach-csv.js` 并导出 `exportOrionBreachesCsv(incidents, now)`。使用 Orion 当前的响应规则和常规排序。只导出 deadline 早于或等于 `now` 的违约事件；CSV 的表头必须恰好为 `id,deadline`，之后每个事件一行，非空输出须以换行符结束。补充有针对性的公开测试，不要增加依赖，并运行测试套件。",
    ).then((turn) => turn.succeeded().orStop());
    await t.sandbox.uploadFile(
      new URL("./tests/hidden.test.js", import.meta.url),
      ".niceeval-hidden.test.js",
    );
    await runVerifier(t);
  },
});
