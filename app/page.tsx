import { ArrowRight } from "lucide-react";
import Link from "next/link";

/** Renders the DriveBox landing page. */
export default function Home(): React.JSX.Element {
  return (
    <div>
      <div className="flex flex-col space-y-4 p-10 sm:text-xl md:text-5xl dark:text-white">
        <h1 className="font-extrabold ">Welcome to DriveBox</h1>
        <p>Save all your files in one place</p>
        <Link
          href="/dashboard"
          className="flex w-fit cursor-pointer items-center bg-blue-500 p-5 text-xl"
        >
          Try it for free
          <ArrowRight className="ml-3" />
        </Link>
      </div>
    </div>
  );
}
