import { defineEval } from "niceeval";
import { signalboxMetadata } from "../metadata.ts";
import { runVerifier } from "../verifier.ts";

// 契约表：复用 04 的 Orion audience scope、01 的 open-only；须拒绝 01 旧 P2 与 03 Vega 干扰。
export default defineEval({
  description: "signalbox 05 检查点：按 Orion 最新分域规则汇总违约事件",
  tags: ["signalbox", "longitudinal", "memory-checkpoint", "memory-conflict", "memory-scope"],
  metadata: signalboxMetadata(5, "checkpoint", "scope"),
  async test(t) {
    await t.send(
      "请实现 `src/orion-summary.js` 并导出 `summarizeOrionBreaches(incidents, now)`。使用 Orion 当前的响应规则，包括它对 audience 的适用范围。返回 `{ open, breached, byPriority }`：`open` 和 `breached` 是数量，`byPriority` 包含数值型的 `P1`、`P2`、`P3` 违约数量。deadline 等于 `now` 也算违约。补充有针对性的公开测试，不要增加依赖，并运行测试套件。",
    ).then((turn) => turn.succeeded().stopOnFailure());
    await t.sandbox.uploadFile(
      new URL("./tests/hidden.test.js", import.meta.url),
      ".niceeval-hidden.test.js",
    );
    await runVerifier(t);
  },
});
