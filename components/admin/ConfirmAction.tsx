"use client";
import { useState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { pressable } from "@/lib/ui";

// Confirm submit button: reflects the form's pending state and, when the
// action finishes (pending goes true → false), calls onComplete so the parent
// can collapse the prompt back to its single button. Needed because admin
// actions redirect to /admin (same page), which keeps this client component
// mounted — so its armed state would otherwise stick after completion.
function ConfirmSubmit({
  pendingLabel,
  className,
  onComplete,
}: {
  pendingLabel: string;
  className: string;
  onComplete: () => void;
}) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) onComplete();
    wasPending.current = pending;
  }, [pending, onComplete]);
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} ${pressable} active:brightness-90 disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100`}
    >
      {pending ? pendingLabel : "Confirm"}
    </button>
  );
}

// Two-step admin action button. First click "arms" it and reveals a
// Confirm/Cancel prompt naming the consequence; only Confirm submits the
// wrapped server action. Prevents accidental one-tap phase changes.
export default function ConfirmAction({
  action,
  label,
  pendingLabel,
  confirmPrompt,
  description,
  tone = "primary",
}: {
  action: () => Promise<void>;
  label: string;
  pendingLabel: string;
  confirmPrompt: string;
  description?: string;
  tone?: "primary" | "danger";
}) {
  const [armed, setArmed] = useState(false);

  const btn =
    tone === "danger"
      ? "border border-red-400 text-red-300 hover:bg-red-500 hover:text-white"
      : "bg-gold text-navy hover:brightness-110";

  if (!armed) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setArmed(true)}
          className={`rounded-full px-5 py-2 text-sm font-bold ${btn} ${pressable} active:brightness-90`}
        >
          {label}
        </button>
        {description && <p className="mt-2 text-xs text-caption">{description}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gold/50 bg-navy/40 p-3">
      <p className="text-sm text-bodytext">{confirmPrompt}</p>
      <div className="mt-3 flex gap-2">
        <form action={action}>
          <ConfirmSubmit
            pendingLabel={pendingLabel}
            className={`rounded-full px-5 py-2 text-sm font-bold transition ${btn}`}
            onComplete={() => setArmed(false)}
          />
        </form>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className={`rounded-full border border-glow px-4 py-2 text-sm text-caption ${pressable}`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
