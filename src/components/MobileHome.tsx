import { useEffect, useMemo, useRef, useState } from "react";
import type { Todo } from "../lib/types";
import {
  buildDayStrip,
  dayKey,
  dueOnDay,
  getHeroPeriod,
  HERO_IMAGES,
  startOfDay,
  type HeroPeriod,
} from "../lib/dates";
import { isOverdue } from "../lib/parseDue";
import { AddTaskSheet } from "./AddTaskSheet";
import { MobileTodoCard } from "./MobileTodoCard";
import { OverflowMenu } from "./OverflowMenu";

function sortActive(a: Todo, b: Todo): number {
  const aOver = a.dueAt != null && isOverdue(a.dueAt) ? 0 : 1;
  const bOver = b.dueAt != null && isOverdue(b.dueAt) ? 0 : 1;
  if (aOver !== bOver) return aOver - bOver;
  const aDue = a.dueAt ?? Number.MAX_SAFE_INTEGER;
  const bDue = b.dueAt ?? Number.MAX_SAFE_INTEGER;
  if (aDue !== bDue) return aDue - bDue;
  return b.updatedAt - a.updatedAt;
}

function greetingFor(period: HeroPeriod): string {
  if (period === "morning") return "Good morning";
  if (period === "noon") return "Good afternoon";
  if (period === "evening") return "Good evening";
  return "Good night";
}

function DayProgress({ value, label }: { value: number; label: string }) {
  const size = 52;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, value));
  const offset = c * (1 - clamped);
  return (
    <div className="mobile-progress" aria-label={label} role="img">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          className="mobile-progress-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="mobile-progress-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="mobile-progress-pct">{Math.round(clamped * 100)}%</span>
    </div>
  );
}

export function MobileHome({
  todos,
  openCount,
  launchAtLogin,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
  onToggleAutostart,
  onOpenSync,
  onOpenBin,
  onToast,
}: {
  todos: Todo[];
  openCount: number;
  launchAtLogin: boolean;
  onAdd: (text: string, dueAt: number | null) => void;
  onEdit: (id: string, text: string, dueAt: number | null) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleAutostart: () => void;
  onOpenSync: () => void;
  onOpenBin: () => void;
  onToast?: (msg: string) => void;
}) {
  const [selectedKey, setSelectedKey] = useState(() => dayKey(startOfDay()));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [period, setPeriod] = useState<HeroPeriod>(() => getHeroPeriod());
  const stripRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => buildDayStrip(), []);

  function openAdd() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(todo: Todo) {
    setEditing(todo);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditing(null);
  }

  useEffect(() => {
    const el = stripRef.current?.querySelector("[data-today='1']");
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
  }, []);

  useEffect(() => {
    const tick = () => setPeriod(getHeroPeriod());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const selectedDay = useMemo(() => {
    const hit = days.find((d) => d.key === selectedKey);
    return hit?.date ?? startOfDay();
  }, [days, selectedKey]);

  const today = startOfDay();
  const todayKey = dayKey(today);
  const todaySelected = selectedKey === todayKey;

  const { active, done, overdueCount } = useMemo(() => {
    const forDay = todos.filter((t) => {
      if (t.dueAt == null) {
        // Undated tasks live on Today
        return todaySelected;
      }
      if (dueOnDay(t.dueAt, selectedDay)) return true;
      // On Today: also surface overdue incomplete tasks from earlier days
      if (todaySelected && !t.done && t.dueAt < today.getTime()) return true;
      return false;
    });
    const activeItems = forDay.filter((t) => !t.done).sort(sortActive);
    const doneItems = forDay.filter((t) => t.done);
    return {
      active: activeItems,
      done: doneItems,
      overdueCount: activeItems.filter((t) => t.dueAt != null && isOverdue(t.dueAt)).length,
    };
  }, [todos, selectedDay, todaySelected, today]);

  const empty = active.length === 0 && done.length === 0;
  const dayTotal = active.length + done.length;
  const dayProgress = dayTotal === 0 ? 1 : done.length / dayTotal;
  const heroTone = period === "evening" || period === "night" ? "dark" : "light";
  const greeting = greetingFor(period);
  const eyebrow =
    openCount === 0
      ? "All clear"
      : overdueCount > 0 && todaySelected
        ? `${overdueCount} overdue · ${openCount} open`
        : `${openCount} open`;

  const selectedLabel = selectedDay.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="mobile-home">
      <section
        className={`mobile-hero hero-${period} hero-tone-${heroTone}`}
        style={{ backgroundImage: `url(${HERO_IMAGES[period]})` }}
      >
        <div className="mobile-hero-scrim" aria-hidden />
        <div className="mobile-hero-glow" aria-hidden />
        <div className="mobile-hero-content">
          <div className="mobile-hero-top">
            <OverflowMenu
              isMobile
              variant="hero"
              launchAtLogin={launchAtLogin}
              onToggleAutostart={onToggleAutostart}
              onOpenSync={onOpenSync}
              onOpenBin={onOpenBin}
            />
            <button
              type="button"
              className={`mobile-date-chip${todaySelected ? " is-active" : ""}`}
              aria-label="Jump to today"
              aria-pressed={todaySelected}
              onClick={() => setSelectedKey(todayKey)}
            >
              Today
            </button>
          </div>

          <div className="mobile-hero-title-row">
            <div className="min-w-0">
              <p className="mobile-hero-eyebrow">
                {greeting} · {eyebrow}
              </p>
              <h1 className="mobile-hero-title">Traylist</h1>
            </div>
            {!empty && (
              <DayProgress
                value={dayProgress}
                label={`${Math.round(dayProgress * 100)} percent of tasks done for ${selectedLabel}`}
              />
            )}
          </div>

          <div className="mobile-day-strip" ref={stripRef} role="listbox" aria-label="Filter by day">
            {days.map((d) => {
              const selected = d.key === selectedKey;
              const fullLabel = d.date.toLocaleDateString([], {
                weekday: "long",
                month: "long",
                day: "numeric",
              });
              return (
                <button
                  key={d.key}
                  type="button"
                  role="option"
                  aria-label={d.isToday ? `Today, ${fullLabel}` : fullLabel}
                  aria-selected={selected}
                  data-today={d.isToday ? "1" : undefined}
                  className={`mobile-day-cell${selected ? " is-selected" : ""}${d.isToday ? " is-today" : ""}`}
                  onClick={() => setSelectedKey(d.key)}
                >
                  <span className="mobile-day-num">{d.dayNum}</span>
                  <span className="mobile-day-wd">{d.weekday}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mobile-sheet">
        <div className="mobile-sheet-handle" aria-hidden />
        <div className="mobile-list-scroll">
          {empty ? (
            <div className="mobile-empty">
              <img
                src="/empty-happy.png"
                alt=""
                width={160}
                height={160}
                className="mobile-empty-art"
                draggable={false}
              />
              <p className="mobile-empty-title">Nothing for this day</p>
              <p className="mobile-empty-hint">Enjoy your free time!</p>
              <button
                type="button"
                className="mobile-empty-cta"
                onClick={openAdd}
              >
                Add a task
              </button>
            </div>
          ) : (
            <>
              {overdueCount > 0 && todaySelected && (
                <p className="mobile-section-note" role="status">
                  {overdueCount} overdue task{overdueCount === 1 ? "" : "s"} shown below
                </p>
              )}
              {active.length > 0 && (
                <>
                  <p className="mobile-section-heading">
                    Up next
                    <span className="mobile-tab-count">{active.length}</span>
                  </p>
                  <ul className="mobile-card-list">
                    {active.map((todo, i) => (
                      <MobileTodoCard
                        key={todo.id}
                        todo={todo}
                        style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                        onToggle={() => onToggle(todo.id)}
                        onDelete={() => onDelete(todo.id)}
                        onEdit={() => openEdit(todo)}
                        onToast={onToast}
                      />
                    ))}
                  </ul>
                </>
              )}

              {done.length > 0 && (
                <div className={`mobile-done-section ${active.length > 0 ? "has-active" : ""}`}>
                  <p className="mobile-done-heading">
                    Done <span className="mobile-tab-count">{done.length}</span>
                  </p>
                  <ul className="mobile-card-list is-done-list">
                    {done.map((todo) => (
                      <MobileTodoCard
                        key={todo.id}
                        todo={todo}
                        onToggle={() => onToggle(todo.id)}
                        onDelete={() => onDelete(todo.id)}
                        onEdit={() => openEdit(todo)}
                        onToast={onToast}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <button
        type="button"
        className="mobile-fab"
        aria-label="Add task"
        onClick={openAdd}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </button>

      <AddTaskSheet
        open={sheetOpen}
        editing={editing}
        onClose={closeSheet}
        onAdd={onAdd}
        onSave={onEdit}
      />
    </div>
  );
}
