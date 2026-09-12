import { ArrowLeft, Bell, FolderTree, Gauge, HardDrive, ShieldCheck, Users } from "lucide-react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { GovernancePanel, type GovernanceView } from "@/components/admin/GovernancePanel";
import DropArea from "@/components/DropArea";
import FileBrowser from "@/components/drive/FileBrowser";
import WorkspaceSidebar from "@/components/drive/WorkspaceSidebar";
import { UpgradeProgressDialog } from "@/components/UpgradeProgressDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { deriveWorkspaceFolderPaths } from "@/lib/file-presentation";
import { sanitizeFolderPathParam } from "@/lib/files";
import { getWorkspace } from "@/server/workspace.functions";

export const Route = createFileRoute("/dashboard")({
  validateSearch: (search: Record<string, unknown>): { dir: string; owner?: string; q?: string; view: "drive" | GovernanceView } => {
    const governanceViews: GovernanceView[] = ["overview", "people", "approvals", "notifications"];
    const view = search.view === "drive" || governanceViews.includes(search.view as GovernanceView)
      ? search.view as "drive" | GovernanceView
      : "drive";
    return {
      dir: sanitizeFolderPathParam(search.dir),
      owner: typeof search.owner === "string" && search.owner.length <= 128 ? search.owner : undefined,
      q: typeof search.q === "string" && search.q.trim().length > 0 && search.q.length <= 200 ? search.q : undefined,
      view,
    };
  },
  beforeLoad: async ({ location, search }) => {
    const workspace = await getWorkspace({ data: { ownerId: search.owner } });
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
  const { dir: currentPath, owner, q = "", view } = Route.useSearch();
  const navigate = useNavigate();

  const { files, folders } = workspace;
  const totalSize = files.reduce((total, file) => total + file.size, 0);
  const isReadOnly = workspace.drive.access === "child-read";
  const isAdmin = workspace.governance.profile.role === "admin" || workspace.governance.profile.role === "superadmin";
  const pendingApprovalCount = workspace.governance.requests.filter((request) => request.approverId === workspace.user.id && request.status === "pending").length;
  const notificationCount = workspace.governance.notifications.filter((notification) => !notification.readAt).length;

  const folderPaths = deriveWorkspaceFolderPaths(
    files,
    folders.map((folder) => folder.path),
  );

  /** Pushes a new directory into the URL so history works like Drive. */
  function handleNavigate(path: string): void {
    void navigate({ to: "/dashboard", search: { dir: path, owner, q: q || undefined, view: "drive" }, replace: false });
  }

  function handleViewChange(nextView: "drive" | GovernanceView): void {
    void navigate({ to: "/dashboard", search: { dir: "", owner: nextView === "drive" ? owner : undefined, q: nextView === "drive" ? q || undefined : undefined, view: nextView } });
  }

  function handleViewDrive(ownerId: string): void {
    void navigate({ to: "/dashboard", search: { dir: "", owner: ownerId, q: undefined, view: "drive" } });
  }

  return (
    <main id="main-content" className="min-h-[calc(100vh-4rem)] bg-slate-100/75 p-3 dark:bg-slate-950/40 sm:p-5">
      <div className="mx-auto flex max-w-[1600px] gap-5">
        <WorkspaceSidebar
          folderPaths={folderPaths}
          activePath={currentPath}
          totalSize={totalSize}
          fileCount={files.length}
          onNavigate={handleNavigate}
          activeView={view}
          isAdmin={isAdmin}
          notificationCount={notificationCount}
          pendingApprovalCount={pendingApprovalCount}
          onViewChange={handleViewChange}
        />

        <div className="min-w-0 flex-1 space-y-4">
          <section className="flex items-center gap-2 overflow-x-auto rounded-2xl border bg-card p-2 shadow-sm lg:hidden" aria-label="Workspace sections">
            <MobileNavButton active={view === "drive"} icon={<HardDrive />} label="Drive" onClick={() => handleViewChange("drive")} />
            {view === "drive" && <MobileFoldersDialog activePath={currentPath} folderPaths={folderPaths} onNavigate={handleNavigate} />}
            {isAdmin && <MobileNavButton active={view === "overview"} icon={<Gauge />} label="Overview" onClick={() => handleViewChange("overview")} />}
            {isAdmin && <MobileNavButton active={view === "people"} icon={<Users />} label="People" onClick={() => handleViewChange("people")} />}
            {isAdmin && <MobileNavButton active={view === "approvals"} icon={<ShieldCheck />} label={`Approvals${pendingApprovalCount ? ` ${pendingApprovalCount}` : ""}`} onClick={() => handleViewChange("approvals")} />}
            <MobileNavButton active={view === "notifications"} icon={<Bell />} label={`Alerts${notificationCount ? ` ${notificationCount}` : ""}`} onClick={() => handleViewChange("notifications")} />
            <UpgradeProgressDialog />
          </section>

          {view === "drive" ? (
            <>
              <section className="flex flex-wrap items-center justify-between gap-3 px-1">
                <div><h1 className="text-2xl font-semibold tracking-tight">{isReadOnly ? `${workspace.drive.ownerName}'s drive` : "My Drive"}</h1><p className="text-sm text-muted-foreground">{isReadOnly ? "Direct child · read-only access" : "Your private S3-compatible workspace"}</p></div>
                <div className="hidden items-center gap-2 lg:flex"><UpgradeProgressDialog /><span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><ShieldCheck className="size-4" />{workspace.governance.profile.role}</span></div>
              </section>
              {isReadOnly && <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100"><p className="text-sm"><strong>Viewing {workspace.drive.ownerName}'s drive.</strong> Downloads are allowed; changes are not.</p><Button variant="outline" size="sm" onClick={() => { void navigate({ to: "/dashboard", search: { dir: "", view: "drive", owner: undefined } }); }}><ArrowLeft className="mr-2 size-4" />Back to My Drive</Button></section>}
              {!isReadOnly && <DropArea destinationPath={currentPath} />}
              <FileBrowser
                files={files}
                folders={folders}
                currentPath={currentPath}
                onNavigate={handleNavigate}
                onSearchChange={(nextQuery) => { void navigate({ to: "/dashboard", search: { dir: currentPath, owner, q: nextQuery || undefined, view: "drive" }, replace: true }); }}
                readOnly={isReadOnly}
                searchQuery={q}
              />
            </>
          ) : (
            <GovernancePanel data={workspace.governance} view={view} onViewDrive={handleViewDrive} />
          )}
        </div>
      </div>
    </main>
  );
}

function MobileNavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }): React.JSX.Element {
  return <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><span className="[&>svg]:size-4">{icon}</span>{label}</button>;
}

function MobileFoldersDialog({ activePath, folderPaths, onNavigate }: { activePath: string; folderPaths: string[]; onNavigate: (path: string) => void }): React.JSX.Element {
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="ghost" className="shrink-0"><FolderTree className="mr-2 size-4" />Folders</Button></DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Browse folders</DialogTitle><DialogDescription>Jump to a folder in this drive.</DialogDescription></DialogHeader>
        <nav aria-label="Drive folders" className="grid gap-1">
          {["", ...folderPaths].map((path) => <DialogClose asChild key={path || "root"}><button type="button" aria-current={activePath === path ? "page" : undefined} onClick={() => onNavigate(path)} className={`rounded-lg px-3 py-2 text-left text-sm hover:bg-muted ${activePath === path ? "bg-primary/10 font-semibold text-primary" : ""}`}>{path || "My Drive"}</button></DialogClose>)}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
