import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/AuthPage";

export const Route = createFileRoute("/sign-up")({
  validateSearch: (search: Record<string, unknown>): { callbackURL?: string } =>
    typeof search.callbackURL === "string" ? { callbackURL: search.callbackURL } : {},
  head: () => ({ meta: [{ title: "Create account · DriveBox" }] }),
  component: SignUpPage,
});

/** Renders the Better Auth registration experience. */
function SignUpPage(): React.JSX.Element {
  const { callbackURL } = Route.useSearch();
  return <AuthPage mode="sign-up" callbackURL={callbackURL} />;
}
