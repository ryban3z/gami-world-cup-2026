import { branding } from "@/lib/config";
import { submitGate } from "./actions";

export default function GatePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">{branding.poolName}</h1>
      <p className="text-sm opacity-80">Enter the password to continue.</p>
      <form action={submitGate} className="flex flex-col gap-3">
        <input
          type="password"
          name="password"
          required
          autoFocus
          className="rounded border p-3"
          placeholder="Password"
        />
        {searchParams.error && (
          <p className="text-sm text-red-500">Wrong password — try again.</p>
        )}
        <button className="rounded bg-gold p-3 font-bold text-navy transition hover:brightness-110">Enter</button>
      </form>
    </main>
  );
}
