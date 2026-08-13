import { defineEval } from "niceeval";
import { signalboxMetadata } from "../metadata.ts";
import { runVerifier } from "../verifier.ts";

// 契约表：在 04 上新增 Orion customer+regulated+P2=10 局部覆盖；其它当前值完整重述。
export default defineEval({
  description: "signalbox 06：加入 Orion regulated 套餐临时例外",
  tags: ["signalbox", "longitudinal", "memory-update", "memory-scope"],
  metadata: signalboxMetadata(6, "update", "scope"),
  async test(t) {
    await t.send(
      "Orion 新增了一条例外合同。当前完整规则是：只处理 open 状态事件；对两类 audience，P1 都是 5 分钟、P3 都是 240 分钟；internal P2 是 30 分钟；customer P2 是 20 分钟，但 `plan: \"regulated\"` 的 customer-facing P2 事件临时改为 10 分钟。请实现 `src/orion-window.js` 并导出 `orionWindowMinutes(incident)`，返回适用的整数分钟数或 null。本次变更不影响 Vega。补充有针对性的公开测试，不要增加依赖，并运行测试套件。",
    ).then((turn) => turn.succeeded().orStop());
    await t.sandbox.uploadFile(
      new URL("./tests/hidden.test.js", import.meta.url),
      ".niceeval-hidden.test.js",
    );
    await runVerifier(t);
  },
});
