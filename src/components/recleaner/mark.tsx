import { cn } from "@/lib/cn";

const FRAME = "M4 28V10.5A6.5 6.5 0 0 1 10.5 4H20V8H10.5A2.5 2.5 0 0 0 8 10.5V28Z";
const CORNER = "M22 4H28V13H24V8H22Z";

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("text-fg", className)} aria-hidden="true">
      <path d={FRAME} fill="currentColor" />
      <path d={CORNER} fill="currentColor" opacity="0.92" />
      <rect x="13" y="17" width="6" height="6" rx="1.3" fill="currentColor" />
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
