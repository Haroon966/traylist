import { useEffect, useRef, useState } from "react";

function IconWifi() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M5 12.5a9 9 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" strokeLinecap="round" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconBin() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
    </svg>
  );
}

function IconLogin() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3v9" strokeLinecap="round" />
      <path d="M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconQuit() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" strokeLinecap="round" />
      <path d="M15 12H8M15 12l-3-3M15 12l-3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function OverflowMenu({
  isMobile,
  variant = "default",
  launchAtLogin,
  onToggleAutostart,
  onOpenSync,
  onOpenBin,
  onQuit,
}: {
  isMobile: boolean;
  variant?: "default" | "hero";
  launchAtLogin: boolean;
  onToggleAutostart: () => void;
  onOpenSync: () => void;
  onOpenBin: () => void;
  onQuit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hero = variant === "hero";

  useEffect(() => {
    if (!open) return;
    function onDoc(e: Event) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          hero
            ? "menu-trigger mobile-hero-menu"
            : "menu-trigger flex h-8 w-8 items-center justify-center rounded-md text-lg leading-none"
        }
        style={
          hero
            ? undefined
            : { color: "var(--ink-muted)", transition: "background 160ms ease" }
        }
        onMouseEnter={
          hero
            ? undefined
            : (e) => {
                e.currentTarget.style.background = "var(--hover)";
              }
        }
        onMouseLeave={
          hero
            ? undefined
            : (e) => {
                e.currentTarget.style.background = "transparent";
              }
        }
      >
        {hero ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        )}
      </button>
      {open && (
        <div
          className={`menu-panel absolute z-20 mt-1 min-w-[13.5rem] overflow-hidden rounded-xl py-1.5 text-[13px] font-medium ${
            hero ? "left-0" : "right-0"
          }`}
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--line)",
          }}
          role="menu"
        >
          <MenuBtn
            icon={<IconWifi />}
            onClick={() => {
              onOpenSync();
              setOpen(false);
            }}
          >
            Wi‑Fi Sync
          </MenuBtn>
          <MenuBtn
            icon={<IconBin />}
            onClick={() => {
              onOpenBin();
              setOpen(false);
            }}
          >
            Bin
          </MenuBtn>
          {!isMobile && (
            <MenuBtn
              icon={<IconLogin />}
              onClick={() => {
                onToggleAutostart();
                setOpen(false);
              }}
            >
              {launchAtLogin ? "Launch at login · On" : "Launch at login"}
            </MenuBtn>
          )}
          {onQuit && (
            <>
              <div className="my-1 h-px" style={{ background: "var(--line)" }} />
              <MenuBtn
                icon={<IconQuit />}
                danger
                onClick={() => {
                  onQuit();
                  setOpen(false);
                }}
              >
                Quit
              </MenuBtn>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuBtn({
  children,
  icon,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`menu-item menu-item-row${danger ? " is-danger" : ""}`}
    >
      <span className="menu-item-icon">{icon}</span>
      <span className="menu-item-label">{children}</span>
    </button>
  );
}
