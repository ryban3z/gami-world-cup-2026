import { register } from "../actions";
import SubmitButton from "@/components/SubmitButton";

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="text-sm opacity-80">
        Pick a display name and a password — that&apos;s how you&apos;ll log back
        in. No email needed.
      </p>
      <form action={register} className="flex flex-col gap-3">
        <input name="display_name" required placeholder="Display name" className="rounded border p-3" />
        <input name="password" type="password" required placeholder="Password" className="rounded border p-3" />
        {searchParams.error && <p className="text-sm text-red-500">{searchParams.error}</p>}
        <SubmitButton pendingLabel="Creating…" className="rounded bg-gold p-3 font-bold text-navy transition hover:brightness-110">Register</SubmitButton>
      </form>
      <a href="/login" className="text-sm underline">Already have an account? Log in</a>
    </main>
  );
}
