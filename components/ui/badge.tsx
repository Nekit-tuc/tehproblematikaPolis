import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "orange" | "green" | "red" | "gray";

const tones: Record<Tone, string> = {
  default: "border-stone-600 bg-stone-800 text-stone-200",
  orange: "border-orange-700/60 bg-orange-950/60 text-orange-200",
  green: "border-emerald-700/60 bg-emerald-950/60 text-emerald-200",
  red: "border-red-700/60 bg-red-950/60 text-red-200",
  gray: "border-zinc-700 bg-zinc-900 text-zinc-300",
};

export function Badge({ className, tone = "default", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}
