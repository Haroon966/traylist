/**
 * Runnable: npx --yes tsx src/lib/scanPairQr.selfcheck.ts
 *
 * Also documents the Android ML Kit pitfall: never pass formats:[QRCode] alone
 * to @tauri-apps/plugin-barcode-scanner (zeros → "Builder error").
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatInvokeError } from "./scanPairQr";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(formatInvokeError("boom") === "boom", "string");
assert(formatInvokeError(new Error("x")) === "x", "Error");
assert(formatInvokeError({ message: "y" }) === "y", "message obj");

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "scanPairQr.ts"),
  "utf8",
);
assert(!/formats:\s*\[/.test(src), "must not pass formats:[…] (Android Builder error)");

console.log("scanPairQr.selfcheck: ok");
