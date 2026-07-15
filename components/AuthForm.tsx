"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { resolveAuthCallback } from "@/lib/navigation";
import { Button } from "@/components/ui/button";

interface AuthFormProps {
  mode: "sign-in" | "sign-up";
}

/** Renders the email/password form shared by sign-in and registration pages. */
export function AuthForm({ mode }: AuthFormProps): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
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
    const callbackURL = resolveAuthCallback(searchParams.get("callbackURL"));

    const result = isSignUp
      ? await authClient.signUp.email({ email, password, name })
      : await authClient.signIn.email({ email, password });

    if (result.error) {
      setError(result.error.message || "Authentication failed");
      setIsSubmitting(false);
      return;
    }

    router.push(callbackURL);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md space-y-5 rounded-lg border p-6 shadow-sm"
    >
      <div>
        <h1 className="text-2xl font-bold">{isSignUp ? "Create your account" : "Welcome back"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isSignUp
            ? "Start storing files privately in DriveBox."
            : "Sign in to access your files."}
        </p>
      </div>

      {isSignUp && (
        <label className="block space-y-2">
          <span className="text-sm font-medium">Name</span>
          <input
            name="name"
            required
            autoComplete="name"
            className="w-full rounded-md border bg-transparent px-3 py-2"
          />
        </label>
      )}

      <label className="block space-y-2">
        <span className="text-sm font-medium">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-md border bg-transparent px-3 py-2"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          className="w-full rounded-md border bg-transparent px-3 py-2"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
      </Button>

      <p className="text-center text-sm text-slate-500">
        {isSignUp ? "Already registered?" : "Need an account?"}{" "}
        <Link
          className="text-blue-600 hover:underline"
          href={isSignUp ? "/sign-in" : "/sign-up"}
        >
          {isSignUp ? "Sign in" : "Create one"}
        </Link>
      </p>
    </form>
  );
}
