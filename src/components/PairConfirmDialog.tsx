import { useEffect, useState } from "react";
import {
  approvePairRequest,
  denyPairRequest,
  onPairRequest,
  type PendingPairEvent,
} from "../lib/sync";
import { formatInvokeError } from "../lib/scanPairQr";

export function PairConfirmDialog() {
  const [req, setReq] = useState<PendingPairEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void onPairRequest((incoming) => {
      setReq(incoming);
      setError(null);
      try {
        navigator.vibrate?.(20);
      } catch {
        /* ignore */
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  if (!req) return null;

  async function allow() {
    if (!req) return;
    setBusy(true);
    setError(null);
    try {
      await approvePairRequest(req.id);
      setReq(null);
    } catch (e) {
      setError(formatInvokeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function deny() {
    if (!req) return;
    setBusy(true);
    setError(null);
    try {
      await denyPairRequest(req.id);
      setReq(null);
    } catch (e) {
      setError(formatInvokeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pair-confirm-root" role="alertdialog" aria-modal="true" aria-labelledby="pair-confirm-title">
      <button type="button" className="pair-confirm-backdrop" aria-label="Dismiss" disabled={busy} onClick={() => void deny()} />
      <div className="pair-confirm-card">
        <div className="pair-confirm-icon" aria-hidden>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12.5a9 9 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" strokeLinecap="round" />
            <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <h2 id="pair-confirm-title">Allow this phone?</h2>
        <p className="pair-confirm-copy">
          <strong>{req.deviceName}</strong> wants to sync Traylist over this Wi‑Fi.
        </p>
        {error && <p className="pair-confirm-error">{error}</p>}
        <div className="pair-confirm-actions">
          <button type="button" className="pair-confirm-deny" disabled={busy} onClick={() => void deny()}>
            Deny
          </button>
          <button type="button" className="pair-confirm-allow" disabled={busy} onClick={() => void allow()}>
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
