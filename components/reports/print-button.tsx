"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "\u0414\u0440\u0443\u043A\u0443\u0432\u0430\u0442\u0438 / PDF" }: { label?: string }) {
  return (
    <Button type="button" size="sm" className="h-9 rounded-2xl text-[11px]" onClick={() => window.print()}>
      <Printer className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}