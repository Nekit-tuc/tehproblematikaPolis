import { AlertTriangle } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";

export function Alert({ title, children, className }: { title: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-3 rounded-lg border border-orange-800/70 bg-orange-950/25 p-4 text-sm", className)}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
      <div>
        <div className="font-medium text-orange-100">{title}</div>
        {children ? <div className="mt-1 text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}
