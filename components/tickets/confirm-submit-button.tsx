"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

type ConfirmSubmitButtonProps = ButtonProps & {
  message: string;
  pendingText?: string;
};

export function ConfirmSubmitButton({ message, pendingText = "Виконується...", onClick, children, disabled, ...props }: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button
      {...props}
      disabled={disabled || pending}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        if (!window.confirm(message)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {pending ? pendingText : children}
    </Button>
  );
}
