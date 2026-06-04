"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { enterGate } from "@/app/gate/actions";
import { pressable } from "@/lib/ui";

const goldPill =
  `rounded-full bg-gold px-8 py-3 text-sm font-bold uppercase tracking-wide text-navy shadow-[0_0_24px_rgba(255,210,74,0.45)] hover:brightness-110 active:brightness-90 md:px-10 md:py-4 md:text-base ${pressable}`;

function EnterButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${goldPill} disabled:opacity-70`}>
      {pending ? "Checking…" : "Enter →"}
    </button>
  );
}

// Landing-page entry. Clicking "Get started" reveals an inline group-password
// field instead of navigating to a separate gate page; a correct password sets
// the gate cookie and lands you on login/register, a wrong one shows inline.
export default function GetStarted({ registrationOpen }: { registrationOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(enterGate, {});

  if (!registrationOpen) {
    return (
      <span
        aria-disabled="true"
        title="Registration isn't open yet"
        className="mt-6 inline-block cursor-not-allowed select-none rounded-full border border-glow bg-panel px-8 py-3 text-sm font-bold uppercase tracking-wide text-caption opacity-60 md:mt-8 md:px-10 md:py-4 md:text-base"
      >
        Registration opens soon
      </span>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`mt-6 inline-block md:mt-8 ${goldPill}`}>
        Get started →
      </button>
    );
  }

  return (
    <form action={formAction} className="mx-auto mt-6 flex max-w-xs flex-col items-stretch gap-2 md:mt-8">
      <input
        type="password"
        name="password"
        required
        autoFocus
        placeholder="Group access password"
        className="rounded-full border px-5 py-3 text-center"
      />
      <EnterButton />
      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
      <p className="text-[11px] text-caption">The shared password from your pool admin.</p>
    </form>
  );
}
