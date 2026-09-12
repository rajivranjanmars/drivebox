import {
  ArrowDownUp,
  ChevronRight,
  Download,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  Search,
  Trash2,
} from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import prettyBytes from "pretty-bytes";
import { useEffect, useMemo, useState } from "react";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  basename,
  countFilesUnderPath,
  deriveWorkspaceFolderPaths,
  filterAndSortFiles,
  joinFolderPath,
  listDirectoryContents,
  type FileSortOrder,
} from "@/lib/file-presentation";
import { cn } from "@/lib/utils";
import type { FileType, FolderType } from "@/typings";

interface FileBrowserProps {
  files: FileType[];
  folders: FolderType[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onSearchChange: (query: string) => void;
  readOnly?: boolean;
  searchQuery: string;
}

interface ToastState {
  message: string;
  tone: "error" | "success";
}

type PendingDelete =
  | { kind: "file"; id: string; name: string }
  | { kind: "folder"; path: string; name: string; fileCount: number }
  | null;

interface FileActionsProps {
  file: FileType;
  onDelete: (file: FileType) => void;
  readOnly: boolean;
}

/** Formats a stored ISO timestamp for compact file metadata. */
function formatFileDate(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

/** Renders consistent download and deletion actions for file rows and cards. */
function FileActions({ file, onDelete, readOnly }: FileActionsProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button asChild variant="ghost" size="icon" className="rounded-lg text-muted-foreground hover:text-primary">
        <a href={file.downloadURL} target="_blank" rel="noopener noreferrer" aria-label={`Download ${file.filename}`}>
          <Download className="size-[17px]" />
        </a>
      </Button>
      {!readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Delete ${file.filename}`}
          onClick={() => onDelete(file)}
        >
          <Trash2 className="size-[17px]" />
        </Button>
      )}
    </div>
  );
}

interface BreadcrumbsProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

/** Renders the Drive-style clickable path from the workspace root. */
function Breadcrumbs({ currentPath, onNavigate }: BreadcrumbsProps): React.JSX.Element {
  const segments = currentPath ? currentPath.split("/") : [];

  return (
    <nav aria-label="Folder location" className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
      <button
        type="button"
        onClick={() => onNavigate("")}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold transition hover:bg-muted",
          segments.length === 0 && "text-primary",
        )}
      >
        <Home className="size-4" aria-hidden="true" />
        My Files
      </button>
      {segments.map((segment, index) => {
        const path = segments.slice(0, index + 1).join("/");
        const isLast = index === segments.length - 1;
        return (
          <span key={path} className="flex min-w-0 items-center">
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
            <button
              type="button"
              onClick={() => onNavigate(path)}
              aria-current={isLast ? "page" : undefined}
              className={cn(
                "min-w-0 max-w-52 truncate rounded-lg px-2 py-1 transition hover:bg-muted",
                isLast && "font-semibold text-primary",
              )}
              title={segment}
            >
              {segment}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

interface FolderCardProps {
  name: string;
  path: string;
  fileCount: number;
  onNavigate: (path: string) => void;
  onDelete: (path: string, name: string, fileCount: number) => void;
  readOnly: boolean;
}

/** Renders one double-clickable folder chip with a hover delete affordance. */
function FolderCard({ name, path, fileCount, onNavigate, onDelete, readOnly }: FolderCardProps): React.JSX.Element {
  return (
    <div className="group flex items-center gap-1 rounded-xl border border-border/70 bg-background/50 p-1.5 pr-1 transition hover:border-primary/35 hover:bg-primary/[0.04]">
      <button
        type="button"
        onClick={() => onNavigate(path)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1.5 text-left"
        title={name}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Folder className="size-[18px]" aria-hidden="true" />
          <span className="sr-only">Folder</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="block text-xs text-muted-foreground">
            {fileCount === 0 ? "Empty folder" : `${fileCount} ${fileCount === 1 ? "file" : "files"}`}
          </span>
        </span>
      </button>
      {!readOnly && <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 shrink-0 rounded-lg text-muted-foreground opacity-100 transition hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
        aria-label={`Delete folder ${name}`}
        onClick={() => onDelete(path, name, fileCount)}
      >
        <Trash2 className="size-4" />
      </Button>}
    </div>
  );
}

/** Renders the searchable folder-and-file browser with Drive-style navigation. */
export default function FileBrowser({ files, folders, currentPath, onNavigate, onSearchChange, readOnly = false, searchQuery }: FileBrowserProps): React.JSX.Element {
  const router = useRouter();
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<FileSortOrder>("desc");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const availableFiles = useMemo(
    () => files.filter((file) => !deletedIds.has(file.id)),
    [deletedIds, files],
  );

  const workspaceFolderPaths = useMemo(
    () => deriveWorkspaceFolderPaths(availableFiles, folders.map((folder) => folder.path)),
    [availableFiles, folders],
  );

  const isSearching = searchQuery.trim().length > 0;
  const searchResults = useMemo(
    () => (isSearching ? filterAndSortFiles(availableFiles, searchQuery, sort) : []),
    [availableFiles, isSearching, searchQuery, sort],
  );

  const listing = useMemo(
    () => listDirectoryContents(availableFiles, workspaceFolderPaths, currentPath),
    [availableFiles, currentPath, workspaceFolderPaths],
  );

  const visibleFolders = isSearching ? [] : listing.folders;
  const visibleFiles = isSearching
    ? searchResults
    : [...listing.files].sort((left, right) => {
      const comparison = new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
      return sort === "asc" ? comparison : -comparison;
    });
  const itemCount = visibleFolders.length + visibleFiles.length;
  const isEmptyWorkspace = availableFiles.length === 0 && workspaceFolderPaths.length === 0;

  /** Opens the confirmation modal for a selected file. */
  function requestFileDelete(file: FileType): void {
    setPendingDelete({ kind: "file", id: file.id, name: file.filename });
  }

  /** Opens the confirmation modal for a folder subtree. */
  function requestFolderDelete(path: string, name: string, fileCount: number): void {
    setPendingDelete({ kind: "folder", path, name, fileCount });
  }

  /** Closes the confirmation and clears its selection. */
  function closeDeleteDialog(): void {
    setPendingDelete(null);
  }

  /** Opens the create-folder modal with a blank name. */
  function openNewFolderDialog(): void {
    setNewFolderName("");
    setNewFolderOpen(true);
  }

  /** Closes the create-folder modal without saving. */
  function closeNewFolderDialog(): void {
    setNewFolderOpen(false);
    setNewFolderName("");
  }

  /** Creates an empty folder at the current location. */
  async function confirmCreateFolder(): Promise<void> {
    const name = newFolderName.trim();
    if (!name || isWorking) return;
    setIsWorking(true);

    try {
      const response = await fetch("/api/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: joinFolderPath(currentPath, name) }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Folder could not be created");
      }
      closeNewFolderDialog();
      setToast({ message: `Folder “${name}” was created.`, tone: "success" });
      await router.invalidate();
    } catch (createError) {
      setToast({
        message: createError instanceof Error ? createError.message : "Folder could not be created",
        tone: "error",
      });
    } finally {
      setIsWorking(false);
    }
  }

  /** Deletes one file or a whole folder subtree, then refreshes server data. */
  async function confirmDelete(): Promise<void> {
    if (!pendingDelete || isWorking) return;
    setIsWorking(true);

    try {
      const isFolder = pendingDelete.kind === "folder";
      const url = isFolder
        ? `/api/folders?path=${encodeURIComponent(pendingDelete.path)}`
        : `/api/files/${pendingDelete.id}`;
      const response = await fetch(url, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Delete failed" })) as { error?: string };
        throw new Error(payload.error || "Delete failed");
      }

      if (isFolder) {
        setToast({ message: `Folder “${pendingDelete.name}” was deleted.`, tone: "success" });
      } else {
        setDeletedIds((current) => new Set(current).add(pendingDelete.id));
        setToast({ message: `${pendingDelete.name} was deleted.`, tone: "success" });
      }
      closeDeleteDialog();
      await router.invalidate();
    } catch (deleteError) {
      setToast({
        message: deleteError instanceof Error ? deleteError.message : "Delete failed",
        tone: "error",
      });
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <section aria-labelledby="files-heading" className="surface overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-3 border-b p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Breadcrumbs currentPath={currentPath} onNavigate={onNavigate} />
          <p className="text-xs text-muted-foreground">
            {isSearching
              ? `${searchResults.length} ${searchResults.length === 1 ? "result" : "results"}`
              : `${itemCount} ${itemCount === 1 ? "item" : "items"}`}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
          <h2 id="files-heading" className="sr-only">Workspace files</h2>
          <div className="min-w-0 flex-1 text-sm text-muted-foreground">{isSearching ? <>Results for <strong className="text-foreground">“{searchQuery}”</strong></> : "Use the search bar above to search this drive."}</div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSort((current) => current === "desc" ? "asc" : "desc")}
              className="flex-1 justify-center sm:flex-none"
              aria-label={`Sort by ${sort === "desc" ? "oldest" : "newest"} first`}
            >
              <ArrowDownUp className="mr-2 size-4" />
              {sort === "desc" ? "Newest" : "Oldest"}
            </Button>
            {!readOnly && (
              <Button type="button" onClick={openNewFolderDialog} className="flex-1 justify-center sm:flex-none">
                <FolderPlus className="mr-2 size-4" />
                New folder
              </Button>
            )}
          </div>
        </div>

        {isSearching && (
          <p className="text-xs text-muted-foreground">
            Searching your entire workspace · results show full paths
          </p>
        )}
      </div>

      {itemCount > 0 && (
        <>
          {visibleFolders.length > 0 && (
            <ul
              aria-label="Folders"
              className="grid gap-2 border-b border-border/70 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-5"
            >
              {visibleFolders.map((folder) => (
                <li key={folder.path}>
                  <FolderCard
                    name={folder.name}
                    path={folder.path}
                    fileCount={countFilesUnderPath(availableFiles, folder.path)}
                    onNavigate={onNavigate}
                    onDelete={requestFolderDelete}
                    readOnly={readOnly}
                  />
                </li>
              ))}
            </ul>
          )}

          {visibleFiles.length > 0 && (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <caption className="sr-only">Files in your private DriveBox workspace</caption>
                  <thead className="bg-muted/45 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-3.5">File</th>
                      <th scope="col" className="px-4 py-3.5">Added</th>
                      <th scope="col" className="px-4 py-3.5">Size</th>
                      <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {visibleFiles.map((file) => (
                      <tr key={file.id} className="group transition-colors hover:bg-primary/[0.025]">
                        <td className="px-5 py-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <FileTypeIcon filename={file.filename} mimeType={file.type} />
                            <div className="min-w-0">
                              <p className="max-w-sm truncate font-semibold" title={file.filename}>{file.filename}</p>
                              <p
                                className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground"
                                title={isSearching ? file.relativePath : file.type}
                              >
                                {isSearching ? file.relativePath : file.type}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                          <time dateTime={file.timestamp}>{formatFileDate(file.timestamp)}</time>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 font-medium">{prettyBytes(file.size)}</td>
                        <td className="px-5 py-4"><FileActions file={file} onDelete={requestFileDelete} readOnly={readOnly} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-border/70 md:hidden">
                {visibleFiles.map((file) => (
                  <li key={file.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <FileTypeIcon filename={file.filename} mimeType={file.type} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold" title={file.filename}>{file.filename}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={file.relativePath}>
                          {isSearching ? file.relativePath : file.type}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <time dateTime={file.timestamp}>{formatFileDate(file.timestamp)}</time>
                          <span aria-hidden="true"> · </span>
                          {prettyBytes(file.size)}
                        </p>
                      </div>
                      <FileActions file={file} onDelete={requestFileDelete} readOnly={readOnly} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {itemCount === 0 && (
        <div className="flex min-h-64 flex-col items-center justify-center px-5 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/[0.07] text-primary">
            {isSearching ? <Search className="size-6" /> : isEmptyWorkspace ? <Files className="size-6" /> : <FolderOpen className="size-6" />}
          </span>
          <h3 className="mt-4 font-bold">
            {isSearching ? "No matching files" : isEmptyWorkspace ? "Your workspace is ready" : "This folder is empty"}
          </h3>
          <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
            {isSearching
              ? `Nothing matches “${searchQuery}”. Try another search.`
              : isEmptyWorkspace
                ? readOnly ? "This child drive does not contain files yet." : "Upload your first files above, or create a folder to get organized."
                : readOnly ? "This folder is empty." : "Drop files into the upload area and they will land in this folder."}
          </p>
          {isSearching && (
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => onSearchChange("")}>
              Clear search
            </Button>
          )}
        </div>
      )}

      {!readOnly && <Dialog open={newFolderOpen} onOpenChange={(open) => { setNewFolderOpen(open); if (!open) setNewFolderName(""); }}>
        <DialogContent className="max-w-md">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <FolderPlus className="size-5" />
          </span>
          <DialogHeader><DialogTitle>Create new folder</DialogTitle><DialogDescription>{currentPath ? `A folder will be created inside “${basename(currentPath)}”.` : "A folder will be created in My Files."}</DialogDescription></DialogHeader>
          <input
            type="text"
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void confirmCreateFolder();
              }
            }}
            placeholder="Folder name"
            aria-label="Folder name"
            maxLength={255}
            autoFocus
            className="h-10 w-full rounded-xl border bg-background/70 px-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeNewFolderDialog} disabled={isWorking}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmCreateFolder()} disabled={isWorking || !newFolderName.trim()}>
              {isWorking ? "Creating…" : "Create folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}

      {!readOnly && <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <DialogContent className="max-w-md">
          <span className="grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <Trash2 className="size-5" />
          </span>
          <DialogHeader><DialogTitle>{pendingDelete?.kind === "folder" ? "Delete this folder?" : "Delete this file?"}</DialogTitle><DialogDescription asChild><div>
            {pendingDelete?.kind === "folder" ? (
              <>
                <span className="font-semibold text-foreground">{pendingDelete.name}</span> and everything inside it
                {pendingDelete.fileCount > 0 && (
                  <>
                    {" "}(<span className="font-semibold text-foreground">
                      {pendingDelete.fileCount} {pendingDelete.fileCount === 1 ? "file" : "files"}
                    </span>)
                  </>
                )} will be permanently removed from your private storage. This cannot be undone.
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground">{pendingDelete?.name}</span> will be permanently removed
                from your private storage. This cannot be undone.
              </>
            )}
          </div></DialogDescription></DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDeleteDialog} disabled={isWorking} autoFocus>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmDelete()} disabled={isWorking}>
              {isWorking ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}

      {toast && (
        <div
          role={toast.tone === "error" ? "alert" : "status"}
          className={`fixed bottom-4 left-4 z-50 max-w-[calc(100vw-2rem)] rounded-xl border bg-card px-4 py-3 text-sm font-medium shadow-xl sm:left-auto sm:right-4 ${toast.tone === "error" ? "border-destructive/25 text-destructive" : "border-emerald-500/25 text-emerald-700 dark:text-emerald-300"}`}
        >
          {toast.message}
        </div>
      )}
    </section>
  );
}
