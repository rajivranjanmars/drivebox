import {
  ArrowDownAZ,
  ArrowUpAZ,
  Download,
  Files,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import prettyBytes from "pretty-bytes";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import { Button } from "@/components/ui/button";
import { filterAndSortFiles, type FileSortOrder } from "@/lib/file-presentation";
import type { FileType } from "@/typings";

interface TableWrapperProps {
  files: FileType[];
}

interface FileActionsProps {
  file: FileType;
  onDelete: (file: FileType) => void;
}

interface ToastState {
  message: string;
  tone: "error" | "success";
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
function FileActions({ file, onDelete }: FileActionsProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button asChild variant="ghost" size="icon" className="rounded-lg text-muted-foreground hover:text-primary">
        <a href={file.downloadURL} target="_blank" rel="noopener noreferrer" aria-label={`Download ${file.filename}`}>
          <Download className="size-[17px]" />
        </a>
      </Button>
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
    </div>
  );
}

/** Renders a searchable, sortable, responsive browser for owned files. */
export default function TableWrapper({ files }: TableWrapperProps): React.JSX.Element {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<FileSortOrder>("desc");
  const [pendingDelete, setPendingDelete] = useState<FileType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (pendingDelete && !dialogRef.current?.open) {
      dialogRef.current?.showModal();
    }
  }, [pendingDelete]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const availableFiles = useMemo(
    () => files.filter((file) => !deletedIds.has(file.id)),
    [deletedIds, files],
  );

  const visibleFiles = useMemo(
    () => filterAndSortFiles(availableFiles, query, sort),
    [availableFiles, query, sort],
  );

  /** Opens the native modal confirmation for a selected file. */
  function requestDelete(file: FileType): void {
    setPendingDelete(file);
  }

  /** Closes the confirmation and clears its selected file. */
  function closeDeleteDialog(): void {
    dialogRef.current?.close();
    setPendingDelete(null);
  }

  /** Deletes one owned file, updates the list, and reports the outcome. */
  async function confirmDelete(): Promise<void> {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/files/${pendingDelete.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({ error: "Delete failed" })) as { error?: string };
        throw new Error(payload.error || "Delete failed");
      }

      setDeletedIds((current) => new Set(current).add(pendingDelete.id));
      setToast({ message: `${pendingDelete.filename} was deleted.`, tone: "success" });
      closeDeleteDialog();
      await router.invalidate();
    } catch (deleteError) {
      setToast({
        message: deleteError instanceof Error ? deleteError.message : "Delete failed",
        tone: "error",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section aria-labelledby="files-heading" className="surface overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-4 border-b p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 id="files-heading" className="text-lg font-bold tracking-tight">Your files</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {availableFiles.length} {availableFiles.length === 1 ? "file" : "files"} in your private workspace
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <label className="relative min-w-0 flex-1 lg:w-64">
            <span className="sr-only">Search files</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search files…"
              className="h-10 w-full rounded-xl border bg-background/70 pl-9 pr-9 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() => setSort((current) => current === "desc" ? "asc" : "desc")}
            className="justify-center"
            aria-label={`Sort by ${sort === "desc" ? "oldest" : "newest"} first`}
          >
            {sort === "desc" ? <ArrowDownAZ className="mr-2 size-4" /> : <ArrowUpAZ className="mr-2 size-4" />}
            {sort === "desc" ? "Newest" : "Oldest"}
          </Button>
        </div>
      </div>

      {visibleFiles.length ? (
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
                          <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground" title={file.relativePath}>
                            {file.relativePath === file.filename ? file.type : file.relativePath}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                      <time dateTime={file.timestamp}>{formatFileDate(file.timestamp)}</time>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-medium">{prettyBytes(file.size)}</td>
                    <td className="px-5 py-4"><FileActions file={file} onDelete={requestDelete} /></td>
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
                    {file.relativePath !== file.filename && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground" title={file.relativePath}>{file.relativePath}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      <time dateTime={file.timestamp}>{formatFileDate(file.timestamp)}</time>
                      <span aria-hidden="true"> · </span>
                      {prettyBytes(file.size)}
                    </p>
                  </div>
                  <FileActions file={file} onDelete={requestDelete} />
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center px-5 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/[0.07] text-primary">
            {query ? <Search className="size-6" /> : <Files className="size-6" />}
          </span>
          <h3 className="mt-4 font-bold">{query ? "No matching files" : "Your workspace is ready"}</h3>
          <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
            {query ? `Nothing matches “${query}”. Try another search.` : "Upload your first file above and it will appear here."}
          </p>
          {query && (
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setQuery("")}>
              Clear search
            </Button>
          )}
        </div>
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setPendingDelete(null)}
        onCancel={() => setPendingDelete(null)}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        className="w-[calc(100%-2rem)] max-w-md rounded-2xl border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm"
      >
        <div className="p-6">
          <span className="grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <Trash2 className="size-5" />
          </span>
          <h3 id="delete-dialog-title" className="mt-4 text-xl font-bold tracking-tight">Delete this file?</h3>
          <p id="delete-dialog-description" className="mt-2 text-sm leading-6 text-muted-foreground">
            <span className="font-semibold text-foreground">{pendingDelete?.filename}</span> will be permanently removed from your private storage. This cannot be undone.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={closeDeleteDialog} disabled={isDeleting} autoFocus>
              Keep file
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmDelete()} disabled={isDeleting}>
              {isDeleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </div>
      </dialog>

      {toast && (
        <div
          role={toast.tone === "error" ? "alert" : "status"}
          className={`fixed bottom-4 left-4 z-50 rounded-xl border bg-card px-4 py-3 text-sm font-medium shadow-xl sm:left-auto sm:right-4 ${toast.tone === "error" ? "border-destructive/25 text-destructive" : "border-emerald-500/25 text-emerald-700 dark:text-emerald-300"}`}
        >
          {toast.message}
        </div>
      )}
    </section>
  );
}
