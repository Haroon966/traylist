import { parseMarkdownLite } from "../lib/todoDecorate";

export function RichText({ text }: { text: string }) {
  const segments = parseMarkdownLite(text);
  return (
    <span>
      {segments.map((seg, i) => {
        if (seg.type === "bold") {
          return (
            <strong key={i} className="font-semibold">
              {seg.value}
            </strong>
          );
        }
        if (seg.type === "italic") {
          return (
            <em key={i} className="italic">
              {seg.value}
            </em>
          );
        }
        if (seg.type === "code") {
          return (
            <code
              key={i}
              className="rounded px-1 py-0.5 text-[0.85em]"
              style={{ background: "var(--hover)", color: "var(--ink)" }}
            >
              {seg.value}
            </code>
          );
        }
        return <span key={i}>{seg.value}</span>;
      })}
    </span>
  );
}
