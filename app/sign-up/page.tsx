import type { Metadata } from "next";
import { AuthPage } from "@/components/AuthPage";

export const metadata: Metadata = { title: "Create account" };

/** Renders the Better Auth registration experience. */
export default function SignUpPage(): React.JSX.Element {
  return <AuthPage mode="sign-up" />;
}
