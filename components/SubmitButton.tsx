"use client";
import { useFormStatus } from "react-dom";

// A submit button that reflects the parent <form>'s server-action state:
// disables itself and shows a pending label while the action runs, so taps
// register visibly and double-submits are prevented.
export default function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-70`}
    >
      {pending ? pendingLabel ?? "Working…" : children}
    </button>
  );
}
