import { login } from "../actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Log in</h1>
      <form action={login} className="flex flex-col gap-3">
        <input name="display_name" required placeholder="Display name" className="rounded border p-3" />
        <input name="password" type="password" required placeholder="Password" className="rounded border p-3" />
        {searchParams.error && <p className="text-sm text-red-500">{searchParams.error}</p>}
        <button className="rounded bg-gold p-3 font-bold text-navy transition hover:brightness-110">Log in</button>
      </form>
      <a href="/register" className="text-sm underline">Need an account? Register</a>
    </main>
  );
}
