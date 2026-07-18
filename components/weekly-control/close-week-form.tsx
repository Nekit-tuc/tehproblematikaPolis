"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? "Закриваємо..." : "Закрити тиждень"}</Button>;
}

export function CloseWeekForm({ periodId, action }: { periodId: string; action: (formData: FormData) => void | Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("Закрити тиждень і створити архівний snapshot? Існуючі заявки не будуть змінені.")) event.preventDefault();
      }}
    >
      <input type="hidden" name="periodId" value={periodId} />
      <SubmitButton />
    </form>
  );
}