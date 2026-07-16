import type { Metadata } from "next";
import { AuthPage } from "@/components/AuthPage";

export const metadata: Metadata = { title: "Sign in" };

/** Renders the Better Auth sign-in experience. */
export default function SignInPage(): React.JSX.Element {
  return <AuthPage mode="sign-in" />;
}
