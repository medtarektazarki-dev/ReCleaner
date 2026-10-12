import { cn } from "@/lib/cn";

const FRAME = "M4 28V10.5A6.5 6.5 0 0 1 10.5 4H20V8H10.5A2.5 2.5 0 0 0 8 10.5V28Z";
const CORNER = "M22 4H28V13H24V8H22Z";

export function SystemCore({ level, live = false }: { level: "steady" | "watch" | "strained"; live?: boolean }) {
  const tone = level === "strained" ? "text-danger" : level === "watch" ? "text-warn" : "text-core";
  return (
    <div className={cn("relative size-52 sm:size-60", tone, live && "core-live")} aria-hidden="true">
      <svg viewBox="0 0 200 200" className="size-full">
        <rect x="22" y="22" width="156" height="156" rx="36" fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1.25" />
        <g className="core-drift">
          <g transform="translate(100 100) scale(4.7) translate(-16 -16)" fill="currentColor">
            <path d={FRAME} />
            <path d={CORNER} opacity="0.72" />
          </g>
        </g>
        <rect x="88" y="105" width="24" height="24" rx="4.5" className="core-square" fill="currentColor" />
      </svg>
    </div>
  );
}
