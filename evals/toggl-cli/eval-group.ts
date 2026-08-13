import { defineEvalGroup } from "niceeval";
import { sandboxLayer } from "niceeval/sandbox";
import entryStats from "./01-entry-stats/eval.ts";
import entryBill from "./02-entry-bill/eval.ts";
import entryBillWeekly from "./03-entry-bill-weekly/eval.ts";
import billingDoc from "./04-billing-doc/eval.ts";
import entryInvoice from "./05-entry-invoice/eval.ts";
import entryInvoiceMonthly from "./06-entry-invoice-monthly/eval.ts";

export default defineEvalGroup({
  onUnavailable: "stop-group",
  sandbox: sandboxLayer().setup(async (sandbox, ctx) => {
    ctx.progress({ message: "installing build deps + rust toolchain" });
    const script = [
      "set -euo pipefail",
      "export DEBIAN_FRONTEND=noninteractive",
      "if command -v apt-get >/dev/null 2>&1; then",
      "  APT_WAIT='-o DPkg::Lock::Timeout=300'",
      "  apt-get $APT_WAIT update -qq",
      "  apt-get $APT_WAIT install -y -qq --no-install-recommends pkg-config libssl-dev libdbus-1-dev build-essential curl ca-certificates >/dev/null",
      "  apt-get clean && rm -rf /var/lib/apt/lists/*",
      "fi",
      "export RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo",
      'if [ ! -x "$CARGO_HOME/bin/rustup" ] && ! command -v rustup >/dev/null 2>&1; then',
      "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile default --default-toolchain stable --no-modify-path >/dev/null",
      "  chmod -R a+rwX /usr/local/rustup /usr/local/cargo",
      "fi",
      'RUSTUP_BIN="$(command -v rustup || echo "$CARGO_HOME/bin/rustup")"',
      '"$RUSTUP_BIN" default stable >/dev/null',
      '"$RUSTUP_BIN" component add rustfmt clippy >/dev/null 2>&1 || true',
      'CARGO_BIN_DIR="$(dirname "$RUSTUP_BIN")"',
      "for tool in cargo rustc rustup rustfmt cargo-fmt cargo-clippy clippy-driver; do",
      '  [ -x "$CARGO_BIN_DIR/$tool" ] && ln -sf "$CARGO_BIN_DIR/$tool" /usr/local/bin/$tool',
      "done",
      "printf 'export RUSTUP_HOME=%s\\nexport CARGO_HOME=%s\\nexport PATH=\"%s:$PATH\"\\n' \"$RUSTUP_HOME\" \"$CARGO_HOME\" \"$CARGO_BIN_DIR\" > /etc/profile.d/rust.sh",
      "chmod +x /etc/profile.d/rust.sh",
      "mkdir -p /opt/cargo-target && chmod 1777 /opt/cargo-target",
      'for home in /root /home/*; do',
      '  [ -d "$home" ] || continue',
      '  mkdir -p "$home/.cargo"',
      "  printf '[build]\\ntarget-dir = \"/opt/cargo-target\"\\n\\n[profile.dev]\\ndebug = false\\n' > \"$home/.cargo/config.toml\"",
      '  chmod -R a+rwX "$home/.cargo" 2>/dev/null || true',
      "done",
      'if [ -n "${CARGO_HOME:-}" ] || [ -d /usr/local/cargo ]; then',
      "  printf '[build]\\ntarget-dir = \"/opt/cargo-target\"\\n\\n[profile.dev]\\ndebug = false\\n' > \"${CARGO_HOME:-/usr/local/cargo}/config.toml\"",
      "fi",
      "cargo --version",
      "python3 --version",
    ].join("\n");

    const installed = await sandbox.runCommand("bash", ["-lc", script], { user: "root" });
    if (installed.exitCode !== 0) {
      throw new Error(
        `rust toolchain setup failed: ${(installed.stderr || installed.stdout).trim().slice(-500)}`,
      );
    }
  }),
  evals: [entryStats, entryBill, entryBillWeekly, billingDoc, entryInvoice, entryInvoiceMonthly],
});
