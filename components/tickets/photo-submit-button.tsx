"use client";

import { useFormStatus } from "react-dom";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PhotoSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      <Upload className="h-4 w-4" />
      {pending ? "Завантаження..." : "Завантажити"}
    </Button>
  );
}
