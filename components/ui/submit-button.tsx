"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { LoadingOverlay } from "@/components/ui/loading-overlay";

type SubmitButtonProps = ButtonProps & {
  pendingText?: string;
  showOverlay?: boolean;
  overlayText?: string;
};

export function SubmitButton({
  children,
  pendingText = "Виконується...",
  disabled,
  showOverlay = false,
  overlayText = "Зачекайте",
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <>
      <Button {...props} disabled={disabled || pending}>
        {pending ? pendingText : children}
      </Button>
      {showOverlay && pending ? <LoadingOverlay text={overlayText} /> : null}
    </>
  );
}
