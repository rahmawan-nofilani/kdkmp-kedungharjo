"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
};

export function PendingSubmitButton({
  children,
  pendingLabel = "Memproses…",
  className,
  disabled = false,
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      aria-busy={pending}
      data-pending={pending ? "true" : "false"}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
