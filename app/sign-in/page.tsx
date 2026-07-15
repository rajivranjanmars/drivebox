import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

/** Renders the Better Auth sign-in page. */
export default function SignInPage(): React.JSX.Element {
  return (
    <main className="flex min-h-[70vh] items-center justify-center p-6">
      <Suspense fallback={<p>Loading…</p>}>
        <AuthForm mode="sign-in" />
      </Suspense>
    </main>
  );
}
