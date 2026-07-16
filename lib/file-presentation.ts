import type { FileType } from "@/typings";

export type FileCategory = "archive" | "audio" | "code" | "document" | "image" | "sheet" | "video" | "file";
export type FileSortOrder = "asc" | "desc";

/** Classifies a file using MIME type first and extension as a safe fallback. */
export function getFileCategory(mimeType: string, filename: string): FileCategory {
  const normalizedType = mimeType.toLowerCase();
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";

  if (normalizedType.startsWith("image/")) return "image";
  if (normalizedType.startsWith("video/")) return "video";
  if (normalizedType.startsWith("audio/")) return "audio";
  if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) return "archive";
  if (["csv", "xls", "xlsx"].includes(extension)) return "sheet";
  if (["js", "jsx", "ts", "tsx", "json", "html", "css", "py", "go", "rs"].includes(extension)) return "code";
  if (normalizedType.startsWith("text/") || ["pdf", "doc", "docx", "md", "rtf"].includes(extension)) return "document";
  return "file";
}

/** Filters files by name and returns a new date-sorted collection. */
export function filterAndSortFiles(
  files: FileType[],
  query: string,
  sort: FileSortOrder,
): FileType[] {
  const normalizedQuery = query.trim().toLowerCase();
  return files
    .filter((file) => file.filename.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => {
      const comparison = new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
      return sort === "asc" ? comparison : -comparison;
    });
}
