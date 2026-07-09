"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

type SubmitButtonProps = ButtonProps & {
  pendingText?: string;
};

export function SubmitButton({ children, pendingText = "Виконується...", disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} disabled={disabled || pending}>
      {pending ? pendingText : children}
    </Button>
  );
}
