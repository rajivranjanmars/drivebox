import { Check, LockKeyhole, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { BrandMark } from "@/components/BrandMark";

interface AuthPageProps {
  callbackURL?: string;
  mode: "sign-in" | "sign-up";
}

/** Renders the responsive split-panel shell shared by authentication routes. */
export function AuthPage({ callbackURL, mode }: AuthPageProps): React.JSX.Element {
  const isSignUp = mode === "sign-up";

  return (
    <main className="page-shell flex min-h-[calc(100vh-4rem)] items-center py-8 sm:py-12">
      <div className="surface mx-auto grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div aria-hidden="true" className="absolute -right-24 -top-24 size-72 rounded-full border-[44px] border-white/10" />
          <div aria-hidden="true" className="absolute -bottom-20 -left-20 size-56 rounded-full bg-white/10 blur-2xl" />

          <div className="relative">
            <Link to="/" className="inline-flex rounded-xl border border-white/20 bg-white/10 p-2.5 shadow-lg backdrop-blur-sm">
              <BrandMark inverse />
            </Link>
            <span className="mt-16 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-white/85">
              <Sparkles className="size-3.5" />
              Private cloud storage
            </span>
            <h2 className="mt-5 text-4xl font-bold tracking-[-0.045em]">
              {isSignUp ? "A safer place for everything important." : "Welcome back to your private workspace."}
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/70">
              Fast, simple file storage with ownership checks on every request and no public bucket URLs.
            </p>
          </div>

          <ul className="relative space-y-3 text-sm text-white/85">
            {[
              { icon: LockKeyhole, label: "Private, account-scoped access" },
              { icon: Zap, label: "Cloudflare-powered performance" },
              { icon: ShieldCheck, label: "No credentials exposed to the browser" },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-lg bg-white/10">
                  <Icon className="size-4" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </aside>

        <section className="flex min-h-[610px] items-center bg-card/70 px-5 py-10 sm:px-10 lg:px-14">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <span className="eyebrow">
                <Check className="size-3.5" />
                Secure workspace
              </span>
            </div>
            <Suspense
              fallback={<div className="h-[390px] animate-pulse rounded-2xl bg-muted" aria-label="Loading authentication form" />}
            >
              <AuthForm mode={mode} callbackURL={callbackURL} />
            </Suspense>
          </div>
        </section>
      </div>
    </main>
  );
}
