import { useCallback, useEffect, useState } from "react";
import { PairQr } from "./PairQr";
import type { PairPayload } from "../lib/pairPayload";
import { formatInvokeError, scanPairQr } from "../lib/scanPairQr";
import {
  connectToHub,
  discoverHubs,
  disconnectHub,
  enableWifiSync,
  disableWifiSync,
  ensureSyncFirewall,
  fetchSyncStatus,
  forgetSyncDevices,
  isAndroidUa,
  onSyncStatus,
  pairWithHub,
  requestPairWithHub,
  type DiscoveredHub,
  type SyncPeerCreds,
  type SyncStatus,
} from "../lib/sync";

type MobileStep = "home" | "manual";
type WaitingHub = DiscoveredHub | null;

function StatusDot({ on }: { on: boolean }) {
  return <span className={`sync-status-dot ${on ? "is-on" : ""}`} aria-hidden />;
}

function IconScan() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
      <path d="M4 12h16" strokeLinecap="round" />
    </svg>
  );
}

function IconWifi() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12.5a9 9 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" strokeLinecap="round" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SyncPanel({
  wifiSyncEnabled,
  peerCreds,
  onWifiSyncEnabled,
  onPeerCreds,
  onClose,
}: {
  wifiSyncEnabled: boolean;
  peerCreds: SyncPeerCreds | null;
  onWifiSyncEnabled: (on: boolean) => void;
  onPeerCreds: (creds: SyncPeerCreds | null) => void;
  onClose: () => void;
}) {
  const mobile = isAndroidUa();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hubs, setHubs] = useState<DiscoveredHub[]>([]);
  const [scannedOnce, setScannedOnce] = useState(false);
  const [code, setCode] = useState("");
  const [manualHost, setManualHost] = useState("");
  const [selected, setSelected] = useState<DiscoveredHub | null>(null);
  const [step, setStep] = useState<MobileStep>("home");
  const [scanning, setScanning] = useState(false);
  const [waitingHub, setWaitingHub] = useState<WaitingHub>(null);
  const [confirmUnpair, setConfirmUnpair] = useState(false);

  useEffect(() => {
    void fetchSyncStatus().then(setStatus).catch(() => setStatus(null));
    const unsubs: Array<() => void> = [];
    void onSyncStatus(setStatus).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, []);

  const refreshHubs = useCallback(async (quiet = false) => {
    if (!mobile || peerCreds) return;
    if (!quiet) setScanning(true);
    try {
      const list = await discoverHubs();
      setHubs(list);
      setScannedOnce(true);
      setSelected((prev) => prev ?? list[0] ?? null);
      if (!quiet && list.length === 0) {
        setMsg("No desktops on this Wi‑Fi yet — enable Sync on your PC");
      }
    } catch (e) {
      setScannedOnce(true);
      if (!quiet) setErr(formatInvokeError(e));
    } finally {
      if (!quiet) setScanning(false);
    }
  }, [mobile, peerCreds]);

  useEffect(() => {
    if (!mobile || peerCreds || step !== "home") return;
    void refreshHubs(true);
    const id = window.setInterval(() => void refreshHubs(true), 5000);
    return () => clearInterval(id);
  }, [mobile, peerCreds, step, refreshHubs]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function clearFeedback() {
    setMsg(null);
    setErr(null);
  }

  async function toggleHub(on: boolean) {
    setBusy(true);
    clearFeedback();
    try {
      const s = on ? await enableWifiSync() : await disableWifiSync();
      setStatus(s);
      onWifiSyncEnabled(on);
      setMsg(
        on
          ? "Ready — scan QR from phone. If it can't connect, tap Allow through firewall once."
          : "Wi‑Fi sync is off",
      );
    } catch (e) {
      setErr(formatInvokeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function openFirewall() {
    setBusy(true);
    clearFeedback();
    try {
      const fw = await ensureSyncFirewall();
      setMsg(fw.detail);
    } catch (e) {
      setErr(formatInvokeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function scan() {
    setBusy(true);
    clearFeedback();
    try {
      const list = await discoverHubs();
      setHubs(list);
      if (list[0]) setSelected(list[0]);
      setMsg(list.length ? `Found ${list.length} desktop${list.length === 1 ? "" : "s"}` : "No desktop found on this Wi‑Fi");
    } catch (e) {
      setErr(formatInvokeError(e));
    } finally {
      setBusy(false);
    }
  }

  const pairTo = useCallback(
    async (hub: DiscoveredHub, pairCode: string) => {
      setBusy(true);
      clearFeedback();
      try {
        const { token } = await pairWithHub(hub, pairCode, "Android");
        const creds = { host: hub.host, port: hub.port, token };
        onPeerCreds(creds);
        const s = await connectToHub(creds);
        setStatus(s);
        try {
          navigator.vibrate?.(16);
        } catch {
          /* ignore */
        }
        if (s.error) setErr(`Paired, but sync failed: ${s.error}`);
        else setMsg("Paired — Traylist will sync on this Wi‑Fi");
        setStep("home");
        setWaitingHub(null);
      } catch (e) {
        setErr(formatInvokeError(e));
      } finally {
        setBusy(false);
      }
    },
    [onPeerCreds],
  );

  async function oneTapConnect(hub: DiscoveredHub) {
    setBusy(true);
    clearFeedback();
    setWaitingHub(hub);
    setMsg(`Waiting for ${hub.name} to Allow on desktop…`);
    try {
      const { token } = await requestPairWithHub(hub, "Android");
      const creds = { host: hub.host, port: hub.port, token };
      onPeerCreds(creds);
      const s = await connectToHub(creds);
      setStatus(s);
      try {
        navigator.vibrate?.(16);
      } catch {
        /* ignore */
      }
      if (s.error) setErr(`Connected, but sync failed: ${s.error}`);
      else setMsg("Connected — syncing on this Wi‑Fi");
      setStep("home");
    } catch (e) {
      setErr(formatInvokeError(e));
    } finally {
      setWaitingHub(null);
      setBusy(false);
    }
  }

  async function pair(e?: React.FormEvent) {
    e?.preventDefault();
    const hub =
      selected ??
      (manualHost.trim()
        ? { name: "Manual", host: manualHost.trim(), port: 17834 }
        : null);
    if (!hub || !code.trim()) {
      setErr("Choose a desktop and enter the 6-digit code");
      return;
    }
    await pairTo(hub, code.trim());
  }

  async function scanAndPair() {
    setBusy(true);
    clearFeedback();
    try {
      const payload: PairPayload = await scanPairQr();
      await pairTo(
        { name: "QR", host: payload.host, port: payload.port },
        payload.code,
      );
    } catch (e) {
      setErr(formatInvokeError(e));
      setBusy(false);
    }
  }

  async function reconnect() {
    if (!peerCreds) return;
    setBusy(true);
    clearFeedback();
    try {
      const s = await connectToHub(peerCreds);
      setStatus(s);
      setMsg(s.enabled ? "Connected" : s.error ?? "Connecting…");
    } catch (e) {
      setErr(formatInvokeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function unpair() {
    setBusy(true);
    clearFeedback();
    setConfirmUnpair(false);
    try {
      await disconnectHub();
      onPeerCreds(null);
      setStatus(await fetchSyncStatus());
      setMsg("Unpaired from desktop");
      setStep("home");
      setScannedOnce(false);
    } catch (e) {
      setErr(formatInvokeError(e));
    } finally {
      setBusy(false);
    }
  }

  const canShowQr = !mobile && Boolean(status?.pairCode && status.lanIp && status.port);
  const connected = Boolean(mobile ? peerCreds && status?.enabled : status?.connected?.length);
  const feedback = err ?? status?.error ?? null;

  return (
    <div className="sync-sheet" role="dialog" aria-modal="true" aria-labelledby="sync-title">
      <header className="sync-header">
        <div className="min-w-0">
          {mobile && step === "manual" ? (
            <button
              type="button"
              className="sync-back"
              onClick={() => {
                setStep("home");
                clearFeedback();
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </button>
          ) : (
            <p className="sync-kicker">Devices</p>
          )}
          <h2 id="sync-title" className="sync-title">
            {mobile && step === "manual" ? "Enter code" : "Wi‑Fi Sync"}
          </h2>
        </div>
        {!mobile && (
          <button type="button" className="sync-done" onClick={onClose}>
            Done
          </button>
        )}
      </header>

      <div className="sync-body">
        {!mobile && (
          <>
            <div className={`sync-hero-card ${wifiSyncEnabled ? "is-live" : ""}`}>
              <div className="sync-hero-row">
                <StatusDot on={wifiSyncEnabled} />
                <div className="min-w-0 flex-1">
                  <p className="sync-hero-label">
                    {wifiSyncEnabled ? "Sharing on this Wi‑Fi" : "Sync is off"}
                  </p>
                  <p className="sync-hero-sub">
                    {wifiSyncEnabled
                      ? "Phone can tap Connect — you'll confirm on this PC"
                      : "Turn on so phones on this Wi‑Fi can find you"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                className={`sync-primary ${wifiSyncEnabled ? "is-quiet" : ""}`}
                onClick={() => void toggleHub(!wifiSyncEnabled)}
              >
                {wifiSyncEnabled ? "Turn off" : "Enable Wi‑Fi sync"}
              </button>
            </div>

            {canShowQr && (
              <section className="sync-qr-card">
                <p className="sync-section-label">Scan with Traylist</p>
                <PairQr
                  host={status!.lanIp!}
                  port={status!.port!}
                  code={status!.pairCode!}
                />
                <p className="sync-pair-code" aria-label="Pair code">
                  {status!.pairCode}
                </p>
                <p className="sync-pair-meta">
                  {status!.lanIp}:{status!.port}
                </p>
              </section>
            )}

            {status?.connected?.length ? (
              <section className="sync-devices">
                <p className="sync-section-label">Connected</p>
                <ul className="sync-device-list">
                  {status.connected.map((name) => (
                    <li key={name} className="sync-device-chip">
                      <IconCheck />
                      <span>{name}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {wifiSyncEnabled && (
              <div className="sync-secondary-actions">
                <button
                  type="button"
                  disabled={busy}
                  className="sync-secondary"
                  onClick={() => void openFirewall()}
                >
                  <IconShield />
                  Allow through firewall (once)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="sync-text-btn"
                  onClick={() =>
                    void forgetSyncDevices()
                      .then(setStatus)
                      .then(() => setMsg("Devices forgotten — new QR ready"))
                  }
                >
                  Forget paired devices
                </button>
              </div>
            )}
          </>
        )}

        {mobile && peerCreds && (
          <div className="sync-connected">
            <div className={`sync-hero-card ${connected ? "is-live" : ""}`}>
              <div className="sync-hero-icon" aria-hidden>
                <IconWifi />
              </div>
              <p className="sync-hero-label">
                {connected ? "Synced with desktop" : "Saved desktop · offline"}
              </p>
              <p className="sync-hero-sub sync-mono">
                {peerCreds.host}:{peerCreds.port}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              className="sync-primary"
              onClick={() => void reconnect()}
            >
              {connected ? "Refresh connection" : "Reconnect"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="sync-text-btn sync-text-danger"
              onClick={() => setConfirmUnpair(true)}
            >
              Unpair this desktop
            </button>
            {confirmUnpair && (
              <div className="sync-confirm" role="alertdialog" aria-labelledby="unpair-title">
                <p id="unpair-title" className="sync-confirm-title">
                  Stop syncing with this PC?
                </p>
                <p className="sync-confirm-hint">You can pair again anytime on this Wi‑Fi.</p>
                <div className="sync-confirm-actions">
                  <button
                    type="button"
                    className="sync-confirm-cancel"
                    disabled={busy}
                    onClick={() => setConfirmUnpair(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="sync-confirm-go"
                    disabled={busy}
                    onClick={() => void unpair()}
                  >
                    Unpair
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {mobile && !peerCreds && step === "home" && (
          <div className="sync-pair-home">
            <div className="sync-intro">
              <div className="sync-intro-icon" aria-hidden>
                <IconWifi />
              </div>
              <p className="sync-intro-title">On this Wi‑Fi</p>
              <p className="sync-intro-copy">
                Tap a desktop to connect. Your PC will ask you to Allow before syncing.
              </p>
            </div>

            <section className="sync-nearby" aria-live="polite">
              <div className="sync-nearby-head">
                <p className="sync-section-label">Nearby devices</p>
                <button
                  type="button"
                  className="sync-refresh"
                  disabled={busy || scanning}
                  onClick={() => void refreshHubs(false)}
                >
                  {scanning ? "Scanning…" : "Refresh"}
                </button>
              </div>

              {hubs.length === 0 ? (
                <div className="sync-nearby-empty">
                  <p>
                    {scanning || !scannedOnce
                      ? "Looking for Traylist on your PC…"
                      : "No desktops found on this Wi‑Fi"}
                  </p>
                  <p className="sync-nearby-hint">
                    {scanning || !scannedOnce
                      ? "Enable Wi‑Fi Sync on desktop first"
                      : "Turn on Wi‑Fi Sync on your PC, then tap Refresh"}
                  </p>
                </div>
              ) : (
                <div className="sync-hub-list" role="listbox" aria-label="Nearby desktops">
                  {hubs.map((h) => {
                    const waiting =
                      waitingHub?.host === h.host && waitingHub.port === h.port;
                    return (
                      <button
                        key={`${h.host}:${h.port}`}
                        type="button"
                        role="option"
                        aria-selected={waiting}
                        disabled={busy}
                        className={`sync-hub-row sync-hub-tap${waiting ? " is-waiting" : ""}`}
                        onClick={() => void oneTapConnect(h)}
                      >
                        <span className="sync-hub-icon" aria-hidden>
                          <IconWifi />
                        </span>
                        <span className="sync-hub-text">
                          <span className="sync-hub-name">{h.name}</span>
                          <span className="sync-hub-addr">
                            {waiting ? "Waiting for Allow on desktop…" : `${h.host}:${h.port}`}
                          </span>
                        </span>
                        <span className="sync-hub-cta">{waiting ? "…" : "Connect"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="sync-alt-actions">
              <button
                type="button"
                disabled={busy}
                className="sync-secondary"
                onClick={() => void scanAndPair()}
              >
                <IconScan />
                Scan QR code
              </button>
              <button
                type="button"
                disabled={busy}
                className="sync-text-btn"
                onClick={() => {
                  clearFeedback();
                  setStep("manual");
                }}
              >
                Enter code manually
              </button>
            </div>
          </div>
        )}

        {mobile && !peerCreds && step === "manual" && (
          <form className="sync-manual" onSubmit={(e) => void pair(e)}>
            <p className="sync-intro-copy sync-manual-lead">
              Find the desktop on Wi‑Fi, or type its IP and the 6-digit code from the QR screen.
            </p>

            <button
              type="button"
              disabled={busy}
              className="sync-secondary"
              onClick={() => void scan()}
            >
              <IconWifi />
              Find desktop on Wi‑Fi
            </button>

            {hubs.length > 0 && (
              <div className="sync-hub-list" role="listbox" aria-label="Discovered desktops">
                {hubs.map((h) => {
                  const active = selected?.host === h.host && selected.port === h.port;
                  return (
                    <button
                      key={`${h.host}:${h.port}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`sync-hub-row${active ? " is-selected" : ""}`}
                      onClick={() => setSelected(h)}
                    >
                      <span className="sync-hub-name">{h.name}</span>
                      <span className="sync-hub-addr">
                        {h.host}:{h.port}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <label className="sync-field">
              <span>Desktop IP</span>
              <input
                value={manualHost}
                onChange={(e) => setManualHost(e.target.value)}
                placeholder="192.168.1.10"
                autoComplete="off"
                inputMode="decimal"
              />
            </label>

            <label className="sync-field">
              <span>Pair code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="000000"
                autoComplete="one-time-code"
                className="sync-code-input"
              />
            </label>

            <button type="submit" disabled={busy} className="sync-primary sync-primary-lg">
              Pair & sync
            </button>
          </form>
        )}

        {(msg || feedback) && (
          <div
            className={`sync-banner ${feedback ? "is-error" : "is-ok"}`}
            role="status"
          >
            {feedback ?? msg}
          </div>
        )}
      </div>

      <button
        type="button"
        className="sync-home-fab"
        aria-label="Home"
        onClick={onClose}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
