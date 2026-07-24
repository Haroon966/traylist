import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { encodePairPayload } from "../lib/pairPayload";

/** Compact QR for LAN pair — high contrast, quiet zone via margin. */
export function PairQr({
  host,
  port,
  code,
}: {
  host: string;
  port: number;
  code: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const payload = encodePairPayload({ host, port, code });
    void QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 200,
      color: { dark: "#134e4a", light: "#ffffff" },
    }).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [host, port, code]);

  if (!src) {
    return (
      <div
        className="mx-auto h-[200px] w-[200px] animate-pulse rounded-2xl"
        style={{ background: "#e8f2f0" }}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={src}
      alt="Scan with Traylist on your phone to pair"
      width={200}
      height={200}
      className="mx-auto rounded-2xl"
    />
  );
}
