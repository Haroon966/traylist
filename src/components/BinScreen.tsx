import { useEffect, useMemo, useState } from "react";
import type { BinnedTodo } from "../lib/types";
import {
  daysLeftInBin,
  formatBinDay,
  sortBin,
} from "../lib/bin";
import { plainTodoText } from "../lib/dates";
import { RichText } from "./RichText";

function IconTrash({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
    </svg>
  );
}

function IconRestore() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M3 12a9 9 0 1 0 3-6.7" strokeLinecap="round" />
      <path d="M3 4v5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" strokeLinejoin="round" />
    </svg>
  );
}

export function BinScreen({
  bin,
  onRestore,
  onEmpty,
  onClose,
}: {
  bin: BinnedTodo[];
  onRestore: (id: string) => void;
  onEmpty: () => void;
  onClose: () => void;
}) {
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const sorted = useMemo(() => sortBin(bin), [bin]);
  const groups = useMemo(() => {
    const map = new Map<string, BinnedTodo[]>();
    for (const item of sorted) {
      const key = formatBinDay(item.deletedAt);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [sorted]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (confirmEmpty) setConfirmEmpty(false);
        else onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmEmpty, onClose]);

  function confirmAndEmpty() {
    onEmpty();
    setConfirmEmpty(false);
  }

  return (
    <div className="bin-sheet" role="dialog" aria-modal="true" aria-labelledby="bin-title">
      <header className="bin-header">
        <div className="bin-header-text min-w-0">
          <div className="bin-title-row">
            <span className="bin-title-icon" aria-hidden>
              <IconTrash size={20} />
            </span>
            <h2 id="bin-title" className="bin-title">
              Bin
            </h2>
          </div>
          <p className="bin-subtitle">
            {sorted.length === 0
              ? "Nothing waiting here"
              : `${sorted.length} item${sorted.length === 1 ? "" : "s"} · kept 30 days`}
          </p>
        </div>
        <button type="button" className="bin-done" onClick={onClose}>
          Done
        </button>
      </header>

      <div className="bin-body">
        {sorted.length === 0 ? (
          <div className="bin-empty">
            <div className="bin-empty-icon" aria-hidden>
              <IconTrash size={28} />
            </div>
            <p className="bin-empty-title">Bin is empty</p>
            <p className="bin-empty-hint">
              Swipe a task left to delete it. You can restore from here for 30 days.
            </p>
            <button type="button" className="bin-empty-cta" onClick={onClose}>
              Back to tasks
            </button>
          </div>
        ) : (
          <>
            <div className="bin-info" role="note">
              <span className="bin-info-icon" aria-hidden>
                <IconClock />
              </span>
              <p>Items auto-remove after 30 days. Restore anytime before then.</p>
            </div>

            {groups.map(([label, items]) => (
              <section key={label} className="bin-group">
                <h3 className="bin-group-label">{label}</h3>
                <ul className="bin-list">
                  {items.map((item) => {
                    const days = daysLeftInBin(item.deletedAt);
                    return (
                      <li key={item.id} className="bin-card">
                        <div className="bin-card-mark" aria-hidden>
                          <IconTrash size={16} />
                        </div>
                        <div className="bin-card-main">
                          <p className={`bin-card-title${item.done ? " is-done" : ""}`}>
                            <RichText text={item.text} />
                          </p>
                          <p className="bin-card-meta">
                            <IconClock />
                            <span>
                              {days} day{days === 1 ? "" : "s"} left
                            </span>
                          </p>
                        </div>
                        <button
                          type="button"
                          className="bin-restore"
                          onClick={() => onRestore(item.id)}
                          aria-label={`Restore ${plainTodoText(item.text) || "task"}`}
                        >
                          <IconRestore />
                          <span>Restore</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            {!confirmEmpty ? (
              <button
                type="button"
                className="bin-empty-all"
                onClick={() => setConfirmEmpty(true)}
              >
                <IconTrash size={16} />
                <span>Empty bin</span>
              </button>
            ) : (
              <div className="bin-confirm" role="alertdialog" aria-labelledby="bin-confirm-title">
                <p id="bin-confirm-title" className="bin-confirm-title">
                  Permanently delete {sorted.length} item{sorted.length === 1 ? "" : "s"}?
                </p>
                <p className="bin-confirm-hint">This cannot be undone.</p>
                <div className="bin-confirm-actions">
                  <button
                    type="button"
                    className="bin-confirm-cancel"
                    onClick={() => setConfirmEmpty(false)}
                  >
                    Cancel
                  </button>
                  <button type="button" className="bin-confirm-go" onClick={confirmAndEmpty}>
                    Empty now
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <button type="button" className="sync-home-fab" aria-label="Home" onClick={onClose}>
        <IconHome />
      </button>
    </div>
  );
}
