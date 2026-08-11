import type { TestContext } from "niceeval";
import { commandSucceeded } from "niceeval/expect";

export interface VerifierWindow {
  contains: string;
  entries: unknown[];
}

export interface VerifierPlan {
  windows?: VerifierWindow[];
  default_entries?: unknown[];
  projects?: unknown[];
  cases: { name: string; args: string[] }[];
}

export interface VerifierCase {
  name: string;
  args: string[];
  exit: number | null;
  stdout: string;
  stderr: string;
  lines: string[];
  requests: string[];
}

export const orderedLines = (verifierCase: VerifierCase, expected: string[]) => {
  let cursor = 0;
  for (const line of verifierCase.lines) {
    if (line === expected[cursor]) cursor += 1;
  }
  return {
    ok: cursor === expected.length,
    message:
      `expected these lines, in this order: ${JSON.stringify(expected)}\n` +
      `actual stdout lines: ${JSON.stringify(verifierCase.lines)}`,
  };
};

/** 运行已由当前 eval 显式上传的隐藏验证器，并收集每个命令用例的结果。 */
export const runVerifier = async (t: TestContext): Promise<Record<string, VerifierCase>> => {
  t.progress({ message: "building the agent's code and running the verifier" });
  const verification = await t.sandbox.runShell("bash tests/run-verifier.sh");
  await t.sandbox.runShell("rm -rf target");
  await t.require(verification, commandSucceeded());

  const parsed = JSON.parse(verification.stdout) as { cases: VerifierCase[] };
  return Object.fromEntries(parsed.cases.map((verifierCase) => [verifierCase.name, verifierCase]));
};
