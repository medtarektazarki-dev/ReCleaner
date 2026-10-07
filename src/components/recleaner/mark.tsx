import { cn } from "@/lib/cn";

const FRAME = "M19.4 4.5H10.2A5.7 5.7 0 0 0 4.5 10.2v11.6a5.7 5.7 0 0 0 5.7 5.7h11.6a5.7 5.7 0 0 0 5.7-5.7V13";
const INDEX = "M22.6 4.5H27.5V9.4";

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("text-fg", className)} aria-hidden="true">
      <path d={FRAME} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="butt" />
      <path d={INDEX} fill="none" stroke="var(--color-core)" strokeWidth="2.6" strokeLinecap="butt" strokeLinejoin="miter" />
      <rect x="13.15" y="13.15" width="5.7" height="5.7" rx="1.15" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("tracking-tight text-fg", className)}>
      <span className="font-semibold">RE</span>
      <span className="font-normal">cleaner</span>
    </span>
  );
}
