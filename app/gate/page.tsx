import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { branding } from "@/lib/config";
import { GATE_COOKIE } from "@/lib/gate";
import { submitGate } from "./actions";
import SubmitButton from "@/components/SubmitButton";

export default function GatePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  // Already through the gate? Don't re-prompt for the site password — head on
  // in (middleware sends you to /login if you're not signed in yet).
  if (cookies().get(GATE_COOKIE)?.value === process.env.GATE_TOKEN) {
    redirect("/home");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">{branding.poolName}</h1>
      <p className="text-sm opacity-80">
        Members only. Enter the entry password you were given to reach
        registration and login.
      </p>
      <p className="text-xs text-caption">
        This is the shared password from your pool admin — not your personal
        account password.
      </p>
      <form action={submitGate} className="flex flex-col gap-3">
        <input
          type="password"
          name="password"
          required
          autoFocus
          className="rounded border p-3"
          placeholder="Entry password"
        />
        {searchParams.error && (
          <p className="text-sm text-red-500">Wrong password — try again.</p>
        )}
        <SubmitButton pendingLabel="Checking…" className="rounded bg-gold p-3 font-bold text-navy transition hover:brightness-110">Enter</SubmitButton>
      </form>
    </main>
  );
}
