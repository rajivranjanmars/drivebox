import { redirect } from "next/navigation";
import DropArea from "@/components/DropArea";
import TableWrapper from "@/components/table/TableWrapper";
import { getDatabase } from "@/db";
import { listFilesForUser } from "@/lib/files";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Renders the authenticated file dashboard from D1 metadata. */
async function Dashboard(): Promise<React.JSX.Element> {
  const currentSession = await getCurrentSession();
  if (!currentSession) {
    redirect("/sign-in?callbackURL=/dashboard");
  }

  const files = await listFilesForUser(getDatabase(), currentSession.user.id);

  return (
    <main className="flex flex-col space-y-4 p-10 dark:text-white">
      <DropArea />
      <section className="container space-y-5">
        <h2 className="font-bold">All files</h2>
        <TableWrapper files={files} />
      </section>
    </main>
  );
}

export default Dashboard
