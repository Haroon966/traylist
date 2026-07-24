/**
 * Runnable: npx --yes tsx src/lib/pairPayload.selfcheck.ts
 */
import { encodePairPayload, parsePairPayload } from "./pairPayload";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const encoded = encodePairPayload({
  host: "192.168.1.20",
  port: 17834,
  code: "042891",
});
assert(encoded.includes("traylist://pair?"), "prefix");
const parsed = parsePairPayload(encoded);
assert(parsed?.host === "192.168.1.20", "host");
assert(parsed?.port === 17834, "port");
assert(parsed?.code === "042891", "code");
assert(parsePairPayload("garbage") === null, "reject junk");

console.log("pairPayload.selfcheck: ok");
