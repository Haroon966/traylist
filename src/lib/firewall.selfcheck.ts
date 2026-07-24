/**
 * Runnable: npx --yes tsx src/lib/firewall.selfcheck.ts
 * Documents the permanent firewall contract for real-user LAN pair.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fw = readFileSync(join(root, "src-tauri/src/sync/firewall.rs"), "utf8");
const hub = readFileSync(join(root, "src-tauri/src/sync/hub.rs"), "utf8");
const panel = readFileSync(join(root, "src/components/SyncPanel.tsx"), "utf8");
const scan = readFileSync(join(root, "src/lib/scanPairQr.ts"), "utf8");

assert(fw.includes("ensure_lan_port"), "firewall API");
assert(fw.includes("firewalld") && fw.includes("ufw"), "linux stacks");
assert(fw.includes("marker_present") && fw.includes("write_marker"), "one-time marker");
assert(fw.includes("netsh") || fw.includes("windows"), "windows path");
assert(hub.includes("sync_ensure_firewall"), "tauri command");
assert(
  !/sync_enable[\s\S]*?ensure_lan_port/.test(hub),
  "sync_enable must not auto-pkexec",
);
assert(panel.includes("ensureSyncFirewall"), "UI wires firewall");
assert(panel.includes("Allow through firewall"), "manual firewall button");
assert(!/formats:\s*\[/.test(scan), "QR scan must not pass formats (ML Kit Builder bug)");

console.log("firewall.selfcheck: ok");
