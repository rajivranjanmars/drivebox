import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/AuthPage";

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>): { callbackURL?: string } =>
    typeof search.callbackURL === "string" ? { callbackURL: search.callbackURL } : {},
  head: () => ({ meta: [{ title: "Sign in · DriveBox" }] }),
  component: SignInPage,
});

/** Renders the Better Auth sign-in experience. */
function SignInPage(): React.JSX.Element {
  const { callbackURL } = Route.useSearch();
  return <AuthPage mode="sign-in" callbackURL={callbackURL} />;
}
