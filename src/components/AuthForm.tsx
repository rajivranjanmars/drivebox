import { AlertCircle, ArrowRight, LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { resolveAuthCallback } from "@/lib/navigation";

interface AuthFormProps {
  callbackURL?: string;
  mode: "sign-in" | "sign-up";
}

const inputClassName = "h-12 w-full rounded-xl border bg-background/70 pl-11 pr-3 text-sm shadow-sm transition placeholder:text-muted-foreground/65 hover:border-primary/30 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10";

/** Renders the email/password form shared by sign-in and registration pages. */
export function AuthForm({ callbackURL: requestedCallbackURL, mode }: AuthFormProps): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSignUp = mode === "sign-up";

  /** Submits credentials through Better Auth and returns to a safe local route. */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "");
    const callbackURL = resolveAuthCallback(requestedCallbackURL ?? null);

    const result = isSignUp
      ? await authClient.signUp.email({ email, password, name })
      : await authClient.signIn.email({ email, password });

    if (result.error) {
      setError(result.error.message || "Authentication failed");
      setIsSubmitting(false);
      return;
    }

    window.location.assign(callbackURL);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" aria-busy={isSubmitting}>
      <div>
        <p className="text-sm font-semibold text-primary">{isSignUp ? "Create an account" : "Sign in"}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
          {isSignUp ? "Build your workspace" : "Good to see you again"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {isSignUp
            ? "Start organizing your files in a private workspace made for focus."
            : "Enter your details to access your files securely."}
        </p>
      </div>

      <div className="space-y-4 pt-2">
        {isSignUp && (
          <label className="block space-y-2">
            <span className="text-sm font-semibold">Name</span>
            <span className="relative block">
              <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
              <input
                name="name"
                required
                autoComplete="name"
                placeholder="Your name"
                className={inputClassName}
              />
            </span>
          </label>
        )}

        <label className="block space-y-2">
          <span className="text-sm font-semibold">Email address</span>
          <span className="relative block">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className={inputClassName}
            />
          </span>
        </label>

        <label className="block space-y-2">
          <span className="flex items-center justify-between gap-3 text-sm font-semibold">
            Password
            {isSignUp && <span className="text-xs font-normal text-muted-foreground">8+ characters</span>}
          </span>
          <span className="relative block">
            <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              placeholder="Enter your password"
              className={inputClassName}
            />
          </span>
        </label>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.07] p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} size="lg" className="w-full">
        {isSubmitting ? (
          <>
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            {isSignUp ? "Creating workspace…" : "Signing in…"}
          </>
        ) : (
          <>
            {isSignUp ? "Create my workspace" : "Open my workspace"}
            <ArrowRight className="ml-2 size-4" />
          </>
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {isSignUp ? "Already have a workspace?" : "New to DriveBox?"}{" "}
        <Link
          className="font-semibold text-primary underline-offset-4 hover:underline"
          to={isSignUp ? "/sign-in" : "/sign-up"}
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
