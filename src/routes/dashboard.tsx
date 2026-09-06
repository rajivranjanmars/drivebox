import { ShieldCheck, Sparkles } from "lucide-react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import DropArea from "@/components/DropArea";
import FileBrowser from "@/components/drive/FileBrowser";
import WorkspaceSidebar from "@/components/drive/WorkspaceSidebar";
import { deriveWorkspaceFolderPaths } from "@/lib/file-presentation";
import { sanitizeFolderPathParam } from "@/lib/files";
import { getWorkspace } from "@/server/workspace.functions";

export const Route = createFileRoute("/dashboard")({
  validateSearch: (search: Record<string, unknown>) => ({
    dir: sanitizeFolderPathParam(search.dir),
  }),
  beforeLoad: async ({ location }) => {
    const workspace = await getWorkspace();
    if (!workspace) {
      throw redirect({
        to: "/sign-in",
        search: { callbackURL: location.href },
      });
    }
    return { workspace };
  },
  head: () => ({ meta: [{ title: "My Files · DriveBox" }] }),
  component: Dashboard,
});

/** Renders the authenticated Google Drive-style private workspace. */
function Dashboard(): React.JSX.Element {
  const { workspace } = Route.useRouteContext();
  const { dir: currentPath } = Route.useSearch();
  const navigate = useNavigate();

  const { files, folders } = workspace;
  const totalSize = files.reduce((total, file) => total + file.size, 0);
  const firstName = workspace.user.name.trim().split(/\s+/, 1)[0] || "there";

  const folderPaths = deriveWorkspaceFolderPaths(
    files,
    folders.map((folder) => folder.path),
  );

  /** Pushes a new directory into the URL so history works like Drive. */
  function handleNavigate(path: string): void {
    void navigate({ to: "/dashboard", search: { dir: path }, replace: false });
  }

  return (
    <main className="page-shell py-6 sm:py-8">
      <div className="flex gap-6">
        <WorkspaceSidebar
          folderPaths={folderPaths}
          activePath={currentPath}
          totalSize={totalSize}
          fileCount={files.length}
          onNavigate={handleNavigate}
        />

        <div className="min-w-0 flex-1 space-y-5">
          <section className="flex flex-wrap items-center justify-between gap-2">
            <span className="eyebrow">
              <Sparkles className="size-3.5" />
              Welcome back, {firstName}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="size-4" />
              Account protected
            </span>
          </section>

          <DropArea destinationPath={currentPath} />

          <FileBrowser
            files={files}
            folders={folders}
            currentPath={currentPath}
            onNavigate={handleNavigate}
          />
        </div>
      </div>
    </main>
  );
}
