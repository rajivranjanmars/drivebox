import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,
  FileUp,
  FolderUp,
  LoaderCircle,
  Pause,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import DropZone from "react-dropzone";
import prettyBytes from "pretty-bytes";
import { Button } from "@/components/ui/button";
import { MAX_FILE_SIZE } from "@/lib/files";
import { cn } from "@/lib/utils";

interface UploadProgress {
  current: number;
  filename: string;
  part: number;
  partCount: number;
  percent: number;
  total: number;
}

interface UploadStatus {
  message: string;
  tone: "error" | "success";
}

interface UploadState {
  completed: boolean;
  fileId: string | null;
  partSize: number;
  uploadId: string;
  uploadedParts: number[];
}

interface BrowserFile extends File {
  path?: string;
  webkitRelativePath: string;
}

function getRelativePath(file: File): string {
  const browserFile = file as BrowserFile;
  const candidate = browserFile.webkitRelativePath || browserFile.path || file.name;
  return candidate.replaceAll("\\", "/").replace(/^\/+/, "").replace(/^(\.\/)+/, "");
}

function makeFingerprint(file: File, relativePath: string): string {
  return JSON.stringify([relativePath, file.size, file.lastModified]);
}

async function waitForRetry(milliseconds: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Upload paused", "AbortError"));
    }, { once: true });
  });
}

/** Retries transient network, rate-limit, and provider failures with backoff. */
async function reliableFetch(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal });
      if (response.ok || (response.status < 500 && response.status !== 408 && response.status !== 429)) {
        return response;
      }
      lastError = new Error(`Temporary upload error (${response.status})`);
      await response.body?.cancel();
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
    }

    if (attempt < 4) {
      const backoff = 400 * 2 ** attempt + Math.floor(Math.random() * 250);
      await waitForRetry(backoff, signal);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("The upload could not be completed");
}

async function readApiError(response: Response, fallback: string): Promise<Error> {
  const payload = await response.json().catch(() => ({ error: fallback })) as { error?: string };
  return new Error(payload.error || fallback);
}

/** Renders folder-aware, resumable multipart uploads with bounded automatic retries. */
export default function DropArea(): React.JSX.Element {
  const router = useRouter();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [status, setStatus] = useState<UploadStatus | null>(null);

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), 5_500);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function uploadFile(file: File, current: number, total: number, signal: AbortSignal): Promise<void> {
    const relativePath = getRelativePath(file);
    const startResponse = await reliableFetch("/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        relativePath,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        fingerprint: makeFingerprint(file, relativePath),
      }),
    }, signal);
    if (!startResponse.ok) throw await readApiError(startResponse, "Upload could not start");
    const upload = await startResponse.json() as UploadState;
    if (upload.completed) return;

    const uploadedParts = new Set(upload.uploadedParts);
    const partCount = Math.ceil(file.size / upload.partSize);
    for (let part = 1; part <= partCount; part += 1) {
      const start = (part - 1) * upload.partSize;
      const end = Math.min(start + upload.partSize, file.size);
      const completedBytes = uploadedParts.has(part) ? end : start;
      setProgress({
        current,
        total,
        filename: relativePath,
        part,
        partCount,
        percent: Math.round((completedBytes / file.size) * 100),
      });
      if (uploadedParts.has(part)) continue;

      const chunk = file.slice(start, end);
      const partResponse = await reliableFetch(
        `/api/uploads/${encodeURIComponent(upload.uploadId)}/parts/${part}`,
        { method: "PUT", headers: { "x-part-size": String(chunk.size) }, body: chunk },
        signal,
      );
      if (!partResponse.ok) throw await readApiError(partResponse, `Part ${part} could not be uploaded`);
      setProgress({
        current,
        total,
        filename: relativePath,
        part,
        partCount,
        percent: Math.round((end / file.size) * 100),
      });
    }

    const completeResponse = await reliableFetch(
      `/api/uploads/${encodeURIComponent(upload.uploadId)}`,
      { method: "POST" },
      signal,
    );
    if (!completeResponse.ok) throw await readApiError(completeResponse, "Upload could not be finalized");
  }

  async function uploadFiles(selectedFiles: File[]): Promise<void> {
    if (progress || selectedFiles.length === 0) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus(null);

    try {
      for (const [index, file] of selectedFiles.entries()) {
        await uploadFile(file, index + 1, selectedFiles.length, controller.signal);
      }
      setStatus({
        message: `${selectedFiles.length} ${selectedFiles.length === 1 ? "file" : "files"} uploaded. Folder paths were preserved.`,
        tone: "success",
      });
      await router.invalidate();
    } catch (uploadError) {
      const wasPaused = controller.signal.aborted;
      setStatus({
        message: wasPaused
          ? "Upload paused. Select the same files again to resume from the saved chunks."
          : uploadError instanceof Error ? uploadError.message : "Upload failed",
        tone: wasPaused ? "success" : "error",
      });
    } finally {
      controllerRef.current = null;
      setProgress(null);
    }
  }

  function pauseUpload(): void {
    controllerRef.current?.abort();
  }

  function selectFolder(event: React.ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    void uploadFiles(files);
  }

  return (
    <DropZone minSize={1} maxSize={MAX_FILE_SIZE} onDrop={(files) => void uploadFiles(files)} disabled={Boolean(progress)} noClick>
      {({ getRootProps, getInputProps, isDragActive, isDragReject, fileRejections, open }) => {
        const isFileTooLarge = fileRejections.some(({ file }) => file.size > MAX_FILE_SIZE);

        return (
          <section className="surface overflow-hidden rounded-2xl p-3 sm:p-4">
            <input ref={folderInputRef} className="hidden" type="file" multiple onChange={selectFolder} />
            <div
              {...getRootProps()}
              className={cn(
                "group relative flex min-h-60 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed px-5 py-8 text-center transition-all duration-300",
                isDragActive
                  ? "scale-[0.995] border-primary bg-primary/[0.09]"
                  : "border-primary/25 bg-gradient-to-br from-primary/[0.045] via-transparent to-violet-500/[0.045] hover:border-primary/45 hover:bg-primary/[0.06]",
                progress && "cursor-wait",
              )}
            >
              <input {...getInputProps({ "aria-label": "Choose files to upload" })} />
              <div aria-hidden="true" className="absolute inset-0 grid-fade opacity-30" />

              <span className={cn(
                "relative mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25 transition-transform duration-300 group-hover:-translate-y-1",
                isDragActive && "-translate-y-1 scale-105",
              )}>
                {progress ? <LoaderCircle className="size-6 animate-spin" /> : <CloudUpload className="size-6" />}
              </span>

              <div className="relative">
                {progress ? (
                  <>
                    <p className="font-semibold">Uploading {progress.current} of {progress.total} · {progress.percent}%</p>
                    <p className="mt-1 max-w-sm truncate text-sm text-muted-foreground">{progress.filename}</p>
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress.percent}
                      className="mx-auto mt-4 h-2 w-56 overflow-hidden rounded-full bg-primary/10"
                    >
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width]" style={{ width: `${progress.percent}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Chunk {progress.part} of {progress.partCount} · Safe to pause and resume</p>
                    <Button type="button" variant="outline" size="sm" className="relative mt-4" onClick={pauseUpload}>
                      <Pause className="mr-2 size-4" /> Pause upload
                    </Button>
                  </>
                ) : isDragReject ? (
                  <>
                    <p className="font-semibold text-destructive">
                      {isFileTooLarge ? "That file is too large" : "This file cannot be uploaded"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">Choose a file up to {prettyBytes(MAX_FILE_SIZE, { binary: true })}.</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold sm:text-lg">
                      {isDragActive ? "Drop to upload securely" : "Drop files or folders here"}
                    </p>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      Resumable chunk uploads · Folder structure preserved · Up to {prettyBytes(MAX_FILE_SIZE, { binary: true })}
                    </p>
                    <div className="relative mt-5 flex flex-wrap justify-center gap-2">
                      <Button type="button" onClick={open}>
                        <FileUp className="mr-2 size-4" /> Choose files
                      </Button>
                      <Button type="button" variant="outline" onClick={() => folderInputRef.current?.click()}>
                        <FolderUp className="mr-2 size-4" /> Choose folder
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {!progress && !isDragReject && (
                <span className="relative mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-emerald-500" />
                  Private S3-compatible storage · Automatic retry and resume
                </span>
              )}
            </div>

            {status && (
              <p
                role={status.tone === "error" ? "alert" : "status"}
                className={cn(
                  "mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm",
                  status.tone === "success"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                {status.tone === "success" ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
                {status.message}
              </p>
            )}
          </section>
        );
      }}
    </DropZone>
  );
}
