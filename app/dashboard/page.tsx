import { Clock3, Files, HardDrive, ShieldCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import prettyBytes from "pretty-bytes";
import DropArea from "@/components/DropArea";
import TableWrapper from "@/components/table/TableWrapper";
import { getDatabase } from "@/db";
import { listFilesForUser } from "@/lib/files";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workspace" };

/** Formats the newest file date for the dashboard summary. */
function formatRecentDate(timestamp: string | undefined): string {
  if (!timestamp) return "No uploads yet";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(timestamp));
}

/** Renders the authenticated private file workspace from D1 metadata. */
export default async function Dashboard(): Promise<React.JSX.Element> {
  const currentSession = await getCurrentSession();
  if (!currentSession) {
    redirect("/sign-in?callbackURL=/dashboard");
  }

  const files = await listFilesForUser(getDatabase(), currentSession.user.id);
  const totalSize = files.reduce((total, file) => total + file.size, 0);
  const firstName = currentSession.user.name.trim().split(/\s+/, 1)[0] || "there";
  const latestTimestamp = files.at(0)?.timestamp;

  const stats = [
    {
      icon: Files,
      label: "Total files",
      value: String(files.length),
      detail: files.length === 1 ? "file stored" : "files stored",
      tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    },
    {
      icon: HardDrive,
      label: "Storage used",
      value: prettyBytes(totalSize),
      detail: "private R2 objects",
      tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
      icon: Clock3,
      label: "Most recent",
      value: formatRecentDate(latestTimestamp),
      detail: latestTimestamp ? "latest upload" : "ready when you are",
      tone: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
    },
  ];

  return (
    <main className="page-shell py-8 sm:py-10 lg:py-12">
      <section className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="eyebrow">
            <Sparkles className="size-3.5" />
            Private workspace
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
            Welcome back, {firstName}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            Upload, organize, and access your files from one focused place.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="size-4" />
          Account protected
        </span>
      </section>

      <section aria-label="Workspace summary" className="mb-6 grid gap-3 sm:grid-cols-3">
        {stats.map(({ icon: Icon, label, value, detail, tone }) => (
          <article key={label} className="surface flex items-center gap-4 rounded-2xl p-4 sm:p-5">
            <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}>
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="mt-0.5 truncate text-lg font-bold tracking-tight">{value}</p>
              <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
            </div>
          </article>
        ))}
      </section>

      <div className="space-y-6">
        <DropArea />
        <TableWrapper files={files} />
      </div>
    </main>
  );
}
