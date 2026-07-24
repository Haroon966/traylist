import { requestPermissions, scan } from "@tauri-apps/plugin-barcode-scanner";
import { parsePairPayload, type PairPayload } from "./pairPayload";

/** Native Android/iOS camera QR scan → pair payload. */
export async function scanPairQr(): Promise<PairPayload> {
  const perm = await requestPermissions();
  if (perm !== "granted") {
    throw new Error("Camera permission needed to scan the QR code");
  }
  // ponytail: plugin Android mapFormats zeros QR_CODE slots then passes 0 to
  // ML Kit → "Builder error". Empty formats uses FORMAT_ALL_FORMATS instead.
  const result = await scan({
    cameraDirection: "back",
    windowed: false,
  });
  const parsed = parsePairPayload(result.content);
  if (!parsed) {
    throw new Error("That QR isn’t a Traylist pair code — open Wi‑Fi Sync on your PC");
  }
  return parsed;
}

export function formatInvokeError(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
