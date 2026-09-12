import { ArrowUpRight, LayoutDashboard, LogOut, Search } from "lucide-react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { BrandMark } from "./BrandMark";
import { ModeToggle } from "./ModeToggle";
import { Button } from "./ui/button";

/** Renders responsive navigation and Better Auth session controls. */
export default function Header(): React.JSX.Element {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const dashboardSearch = useRouterState({ select: (state) => state.location.search as { dir?: string; owner?: string; q?: string; view?: string } });
  const { data: session, isPending } = authClient.useSession();
  const isDashboard = pathname.startsWith("/dashboard");

  /** Ends the active session and returns to the landing page. */
  async function handleSignOut(): Promise<void> {
    await authClient.signOut();
    await router.navigate({ to: "/" });
    await router.invalidate();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" aria-label="DriveBox home" className="rounded-xl">
          <BrandMark />
        </Link>

        {isDashboard && (
          <label className="relative min-w-0 flex-1 md:max-w-2xl">
            <span className="sr-only">Search DriveBox</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={dashboardSearch.q ?? ""}
              onChange={(event) => { void router.navigate({ to: "/dashboard", search: { dir: dashboardSearch.dir ?? "", owner: dashboardSearch.owner, q: event.target.value || undefined, view: "drive" }, replace: true }); }}
              placeholder="Search in DriveBox"
              className="h-11 w-full rounded-full border-0 bg-muted pl-11 pr-4 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-primary/30 sm:h-12 sm:pl-12"
            />
          </label>
        )}

        <nav aria-label="Primary navigation" className="flex items-center gap-1 sm:gap-2">
          <ModeToggle />
          {!isPending && session ? (
            <>
              {!isDashboard && (
                <Button asChild variant="ghost" className="hidden sm:inline-flex">
                  <Link to="/dashboard" search={{ dir: "", view: "drive" }}>
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
                <Link to="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/sign-up">
                  Activate account
                  <ArrowUpRight className="ml-1.5 size-4" />
                </Link>
              </Button>
            </>
          ) : (
            <span className="h-9 w-24 animate-pulse rounded-xl bg-muted" role="status" aria-label="Loading session" />
          )}
        </nav>
      </div>
    </header>
  );
}
