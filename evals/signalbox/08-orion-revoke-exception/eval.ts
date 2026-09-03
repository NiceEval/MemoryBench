import { defineEval } from "niceeval";
import { signalboxMetadata } from "../metadata.ts";
import { runVerifier } from "../verifier.ts";

// 契约表：撤销 06 的 regulated 覆盖；保留 04 的 customer P2=20/internal P2=30 与其它稳定值。
export default defineEval({
  description: "signalbox 08：撤销 Orion regulated 套餐例外",
  tags: ["signalbox", "longitudinal", "memory-revocation"],
  metadata: signalboxMetadata(8, "revoke", "forgetting"),
  async test(t) {
    await t.send(
      "Orion 已撤销 regulated 套餐例外，因为它造成了错误告警。当前完整规则是：只处理 open 状态事件；对两类 audience，P1 都是 5 分钟、P3 都是 240 分钟；不论 plan 是什么，customer P2 都是 20 分钟，internal P2 都是 30 分钟。旧的 regulated P2=10 分钟覆盖规则不得再生效。请实现 `src/orion-window.js` 并导出 `orionWindowMinutes(incident)`，返回适用的整数分钟数或 null。补充有针对性的公开测试，不要增加依赖，并运行测试套件。",
    ).then((turn) => turn.succeeded().orStop());
    await t.sandbox.uploadFile(
      new URL("./tests/hidden.test.js", import.meta.url),
      ".niceeval-hidden.test.js",
    );
    await runVerifier(t);
  },
});
