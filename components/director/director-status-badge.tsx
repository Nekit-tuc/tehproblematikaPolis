import { cn } from "@/lib/utils";

const tones = {
  green: "border-emerald-400/20 bg-emerald-500/14 text-emerald-300",
  red: "border-red-400/20 bg-red-500/14 text-red-300",
  orange: "border-orange-400/20 bg-orange-500/14 text-orange-300",
  blue: "border-blue-400/20 bg-blue-500/14 text-blue-300",
  amber: "border-amber-400/20 bg-amber-500/14 text-amber-300",
  gray: "border-zinc-500/20 bg-zinc-500/14 text-zinc-300",
};

export type DirectorStatusTone = keyof typeof tones;

export function DirectorStatusBadge({ label, tone = "gray", className }: { label: string; tone?: DirectorStatusTone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none",
        "whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{label}</span>
    </span>
  );
}
