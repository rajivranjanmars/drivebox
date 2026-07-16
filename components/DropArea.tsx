"use client";

import { AlertCircle, CheckCircle2, CloudUpload, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import DropZone from "react-dropzone";
import prettyBytes from "pretty-bytes";
import { MAX_FILE_SIZE } from "@/lib/files";
import { cn } from "@/lib/utils";

interface UploadProgress {
  current: number;
  filename: string;
  total: number;
}

interface UploadStatus {
  message: string;
  tone: "error" | "success";
}

/** Renders a bounded drag-and-drop uploader with clear request progress and status. */
export default function DropArea(): React.JSX.Element {
  const router = useRouter();
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [status, setStatus] = useState<UploadStatus | null>(null);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), 4500);
    return () => window.clearTimeout(timer);
  }, [status]);

  /** Streams one file directly to the authenticated upload endpoint. */
  async function uploadFile(selectedFile: File): Promise<void> {
    const response = await fetch("/api/files", {
      method: "POST",
      headers: {
        "content-type": selectedFile.type || "application/octet-stream",
        "x-file-name": encodeURIComponent(selectedFile.name),
        "x-file-size": String(selectedFile.size),
      },
      body: selectedFile,
    });

    if (!response.ok) {
      const payload = await response
        .json()
        .catch(() => ({ error: "Upload failed" })) as { error?: string };
      throw new Error(payload.error || "Upload failed");
    }
  }

  /** Uploads accepted files sequentially to keep memory and request load bounded. */
  async function onDrop(acceptedFiles: File[]): Promise<void> {
    if (progress || acceptedFiles.length === 0) return;
    setStatus(null);

    try {
      for (const [index, file] of acceptedFiles.entries()) {
        setProgress({ current: index + 1, filename: file.name, total: acceptedFiles.length });
        await uploadFile(file);
      }
      setStatus({
        message: `${acceptedFiles.length} ${acceptedFiles.length === 1 ? "file" : "files"} uploaded securely.`,
        tone: "success",
      });
      router.refresh();
    } catch (uploadError) {
      setStatus({
        message: uploadError instanceof Error ? uploadError.message : "Upload failed",
        tone: "error",
      });
    } finally {
      setProgress(null);
    }
  }

  return (
    <DropZone minSize={1} maxSize={MAX_FILE_SIZE} onDrop={onDrop} disabled={Boolean(progress)}>
      {({ getRootProps, getInputProps, isDragActive, isDragReject, fileRejections }) => {
        const isFileTooLarge = fileRejections.some(({ file }) => file.size > MAX_FILE_SIZE);

        return (
          <section className="surface overflow-hidden rounded-2xl p-3 sm:p-4">
            <div
              {...getRootProps()}
              className={cn(
                "group relative flex min-h-52 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed px-5 py-8 text-center transition-all duration-300",
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
                    <p className="font-semibold">Uploading {progress.current} of {progress.total}</p>
                    <p className="mt-1 max-w-xs truncate text-sm text-muted-foreground">{progress.filename}</p>
                    <div
                      role="progressbar"
                      aria-valuetext={`Uploading file ${progress.current} of ${progress.total}`}
                      className="mx-auto mt-4 h-1.5 w-44 overflow-hidden rounded-full bg-primary/10"
                    >
                      <div className="loading-shimmer h-full w-full rounded-full" />
                    </div>
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
                      {isDragActive ? "Drop to upload securely" : "Drop files here, or click to browse"}
                    </p>
                    <p className="mt-1.5 text-sm text-muted-foreground">Any file type · Up to {prettyBytes(MAX_FILE_SIZE, { binary: true })} each</p>
                  </>
                )}
              </div>

              {!progress && !isDragReject && (
                <span className="relative mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-emerald-500" />
                  Stored privately in Cloudflare R2
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
