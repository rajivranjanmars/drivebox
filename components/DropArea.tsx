"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import DropZone from "react-dropzone";
import { MAX_FILE_SIZE } from "@/lib/files";
import { cn } from "@/lib/utils";

/** Renders a bounded drag-and-drop uploader that streams files to the server. */
const DropArea = (): React.JSX.Element => {
  const router = useRouter();
  const [loading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (loading || acceptedFiles.length === 0) return;
    setIsLoading(true);
    setError(null);

    try {
      for (const file of acceptedFiles) {
        await uploadFile(file);
      }
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <DropZone minSize={1} maxSize={MAX_FILE_SIZE} onDrop={onDrop} disabled={loading}>
      {({ getRootProps, getInputProps, isDragActive, isDragReject, fileRejections }) => {
        const isFileTooLarge = fileRejections.some(
          ({ file }) => file.size > MAX_FILE_SIZE,
        );

        return (
          <section className="m-4">
            <div
              {...getRootProps()}
              className={cn(
                "flex h-52 w-full items-center justify-center rounded-lg border border-dashed p-5 text-center",
                isDragActive
                  ? "animate-pulse bg-[#6697e7] text-white"
                  : "bg-slate-100/50 text-slate-400 dark:bg-slate-800/80",
              )}
            >
              <input {...getInputProps()} />
              {!isDragActive && (loading ? "Uploading…" : "Click here or drop a file to upload")}
              {isDragActive && !isDragReject && "Drop to upload this file"}
              {isDragReject && !isFileTooLarge && "File type not accepted"}
              {isFileTooLarge && (
                <div className="mt-10 flex items-center justify-center text-red-600">
                  File is too large
                </div>
              )}
            </div>
            {error && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {error}
              </p>
            )}
          </section>
        );
      }}
    </DropZone>
  );
};

export default DropArea;
