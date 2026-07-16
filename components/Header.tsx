"use client";

import { ArrowUpRight, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { BrandMark } from "./BrandMark";
import { ModeToggle } from "./ModeToggle";
import { Button } from "./ui/button";

/** Renders responsive navigation and Better Auth session controls. */
export default function Header(): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const isDashboard = pathname.startsWith("/dashboard");

  /** Ends the active session and returns to the landing page. */
  async function handleSignOut(): Promise<void> {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-xl">
      <div className="page-shell flex h-16 items-center justify-between gap-3">
        <Link href="/" aria-label="DriveBox home" className="rounded-xl">
          <BrandMark />
        </Link>

        <nav aria-label="Primary navigation" className="flex items-center gap-1 sm:gap-2">
          <ModeToggle />
          {!isPending && session ? (
            <>
              {!isDashboard && (
                <Button asChild variant="ghost" className="hidden sm:inline-flex">
                  <Link href="/dashboard">
                    <LayoutDashboard className="mr-2 size-4" />
                    Dashboard
                  </Link>
                </Button>
              )}
              <span
                title={session.user.name}
                className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white shadow-sm"
              >
                {session.user.name.trim().charAt(0).toUpperCase() || "D"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                aria-label="Sign out"
                className="rounded-full text-muted-foreground hover:text-destructive"
              >
                <LogOut className="size-[18px]" />
              </Button>
            </>
          ) : !isPending ? (
            <>
              <Button asChild variant="ghost" className="hidden sm:inline-flex">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/sign-up">
                  Get started
                  <ArrowUpRight className="ml-1.5 size-4" />
                </Link>
              </Button>
            </>
          ) : (
            <span className="h-9 w-24 animate-pulse rounded-xl bg-muted" aria-label="Loading session" />
          )}
        </nav>
      </div>
    </header>
  );
}
