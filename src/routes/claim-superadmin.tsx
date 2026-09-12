import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/claim-superadmin")({
  head: () => ({ meta: [{ title: "Claim superadmin · DriveBox" }] }),
  component: ClaimSuperadmin,
});

function ClaimSuperadmin(): React.JSX.Element {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const token = String(new FormData(event.currentTarget).get("token") ?? "");
    const response = await fetch("/api/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "The claim could not be completed");
      setBusy(false);
      return;
    }
    await router.navigate({ to: "/dashboard", search: { dir: "", view: "overview" } });
    await router.invalidate();
  }

  return (
    <main id="main-content" className="grid min-h-[calc(100vh-4rem)] place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader><span className="mb-2 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck /></span><CardTitle>Claim the superadmin role</CardTitle><CardDescription>This one-time recovery path is only for a verified operator upgrading a legacy DriveBox database. Existing users are never promoted automatically.</CardDescription></CardHeader>
        <CardContent>
          {isPending ? <p className="text-sm text-muted-foreground">Checking your session…</p> : !session ? <p className="text-sm">Sign in with the configured operator email first. <Link to="/sign-in" className="font-semibold text-primary underline">Sign in</Link></p> : (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-sm text-muted-foreground">Signed in as <strong className="text-foreground">{session.user.email}</strong></p>
              <label className="block space-y-1.5 text-sm font-medium">Bootstrap token<input name="token" type="password" required autoComplete="off" className="h-11 w-full rounded-xl border bg-background px-3 font-normal" /></label>
              {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={busy}>{busy ? "Claiming…" : "Claim superadmin"}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
