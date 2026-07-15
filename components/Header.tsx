"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { ModeToggle } from "./ModeToggle";
import { Button } from "./ui/button";

/** Renders navigation and session controls backed by Better Auth. */
const Header = (): React.JSX.Element => {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  /** Ends the active session and returns to the landing page. */
  async function handleSignOut(): Promise<void> {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="m-2 flex flex-row items-center justify-between">
      <Link href="/" className="flex items-center space-x-2">
        <div className="hidden rounded border-slate-600 md:block">
          <Image
            src="/folders.png"
            alt="DriveBox logo"
            height={50}
            width={50}
            className="object-contain"
          />
        </div>
        <h1 className="mx-2 font-serif text-xl font-bold text-[#00a2ff]">
          DriveBox
        </h1>
      </Link>

      <div className="my-1 flex items-center space-x-2 px-5">
        <ModeToggle />
        {!isPending && session ? (
          <>
            <span className="hidden text-sm text-slate-500 sm:inline">
              {session.user.name}
            </span>
            <Button variant="outline" onClick={handleSignOut}>
              Sign out
            </Button>
          </>
        ) : !isPending ? (
          <Button asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
        ) : null}
      </div>
    </header>
  );
};

export default Header;
