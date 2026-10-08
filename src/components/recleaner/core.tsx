import { cn } from "@/lib/cn";

export function SystemCore({ level, live = false }: { level: "steady" | "watch" | "strained"; live?: boolean }) {
  const tone = level === "strained" ? "text-danger" : level === "watch" ? "text-warn" : "text-core";
  return (
    <div className={cn("relative size-52 sm:size-60", tone, live && "core-live")} aria-hidden="true">
      <svg viewBox="0 0 200 200" className="size-full">
        <rect x="22" y="22" width="156" height="156" rx="36" fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1.25" />
        <g className="core-drift">
          <g transform="translate(100 100) scale(4.15) translate(-16 -16)">
            <path
              d="M19.4 4.5H10.2A5.7 5.7 0 0 0 4.5 10.2v11.6a5.7 5.7 0 0 0 5.7 5.7h11.6a5.7 5.7 0 0 0 5.7-5.7V13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="butt"
            />
            <path
              d="M22.6 4.5H27.5V9.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="butt"
              strokeLinejoin="miter"
              opacity="0.45"
            />
          </g>
        </g>
        <rect x="88" y="88" width="24" height="24" rx="4.5" className="core-square" fill="currentColor" />
      </svg>
    </div>
  );
}
