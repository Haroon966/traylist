/** One-scan pair payload embedded in the desktop QR code. */
export type PairPayload = {
  host: string;
  port: number;
  code: string;
};

const PREFIX = "traylist://pair?";

export function encodePairPayload(p: PairPayload): string {
  const q = new URLSearchParams({
    host: p.host,
    port: String(p.port),
    code: p.code,
  });
  return `${PREFIX}${q.toString()}`;
}

export function parsePairPayload(raw: string): PairPayload | null {
  const text = raw.trim();
  try {
    if (text.startsWith("traylist://")) {
      const u = new URL(text.replace("traylist://", "https://traylist.local/"));
      const host = u.searchParams.get("host")?.trim();
      const port = Number(u.searchParams.get("port") || "17834");
      const code = u.searchParams.get("code")?.trim() ?? "";
      if (!host || !/^\d{6}$/.test(code)) return null;
      return { host, port: Number.isFinite(port) ? port : 17834, code };
    }
    // plain JSON fallback
    const j = JSON.parse(text) as Partial<PairPayload>;
    if (j.host && j.code && /^\d{6}$/.test(String(j.code))) {
      return {
        host: String(j.host),
        port: Number(j.port) || 17834,
        code: String(j.code),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}
