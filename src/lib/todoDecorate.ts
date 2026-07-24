/** Auto-icon keys (SVG) — no emoji per ui-ux-pro-max */
export type IconKey =
  | "calendar"
  | "phone"
  | "cart"
  | "mail"
  | "wrench"
  | "book"
  | "pen"
  | "plane"
  | "activity"
  | "utensils"
  | "card"
  | "clock"
  | "dot";

const ICON_RULES: { pattern: RegExp; icon: IconKey }[] = [
  { pattern: /\b(meet|meeting|calendar|appoint)\w*/i, icon: "calendar" },
  { pattern: /\b(call|phone|dial)\w*/i, icon: "phone" },
  { pattern: /\b(buy|shop|grocery|groceries|store)\w*/i, icon: "cart" },
  { pattern: /\b(email|mail|inbox)\w*/i, icon: "mail" },
  { pattern: /\b(fix|bug|code|deploy|pr\b|commit)\w*/i, icon: "wrench" },
  { pattern: /\b(book|read|chapter)\w*/i, icon: "book" },
  { pattern: /\b(write|draft|blog|essay)\w*/i, icon: "pen" },
  { pattern: /\b(travel|flight|trip|pack)\w*/i, icon: "plane" },
  { pattern: /\b(gym|run|workout|exercise)\w*/i, icon: "activity" },
  { pattern: /\b(cook|dinner|lunch|breakfast|recipe)\w*/i, icon: "utensils" },
  { pattern: /\b(pay|bill|invoice|bank)\w*/i, icon: "card" },
  { pattern: /\b(today|tomorrow|tonight|morning|evening|\d+\s*(am|pm))\b/i, icon: "clock" },
];

export function pickIcon(text: string): IconKey {
  for (const rule of ICON_RULES) {
    if (rule.pattern.test(text)) return rule.icon;
  }
  return "dot";
}

export type Segment =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string };

/** Markdown-lite: **bold**, *italic* / _italic_, `code` */
export function parseMarkdownLite(input: string): Segment[] {
  const segments: Segment[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    if (match.index > last) {
      segments.push({ type: "text", value: input.slice(last, match.index) });
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      segments.push({ type: "bold", value: token.slice(2, -2) });
    } else if (
      (token.startsWith("*") && token.endsWith("*")) ||
      (token.startsWith("_") && token.endsWith("_"))
    ) {
      segments.push({ type: "italic", value: token.slice(1, -1) });
    } else if (token.startsWith("`") && token.endsWith("`")) {
      segments.push({ type: "code", value: token.slice(1, -1) });
    } else {
      segments.push({ type: "text", value: token });
    }
    last = match.index + token.length;
  }
  if (last < input.length) {
    segments.push({ type: "text", value: input.slice(last) });
  }
  if (!segments.length) {
    segments.push({ type: "text", value: input });
  }
  return segments;
}

export function stripMarkdownLite(input: string): string {
  return input
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}
