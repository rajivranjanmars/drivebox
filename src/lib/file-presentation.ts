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

/** Filters files by mirrored path and returns a new date-sorted collection. */
export function filterAndSortFiles(
  files: FileType[],
  query: string,
  sort: FileSortOrder,
): FileType[] {
  const normalizedQuery = query.trim().toLowerCase();
  return files
    .filter((file) => file.relativePath.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => {
      const comparison = new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
      return sort === "asc" ? comparison : -comparison;
    });
}

/** Returns the parent directory of a mirrored file or folder path (`""` is root). */
export function dirname(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator === -1 ? "" : path.slice(0, separator);
}

/** Returns the final segment of a folder path. */
export function basename(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator === -1 ? path : path.slice(separator + 1);
}

/** Joins a current directory and a child segment into a normalized folder path. */
export function joinFolderPath(parent: string, segment: string): string {
  const cleanSegment = segment.trim().replaceAll("/", " ").replace(/\s+/g, " ");
  if (!cleanSegment) return parent;
  return parent ? `${parent}/${cleanSegment}` : cleanSegment;
}

/** Returns every ancestor directory of a path, nearest root first (path excluded). */
export function getAncestorPaths(path: string): string[] {
  const ancestors: string[] = [];
  let current = dirname(path);
  while (current) {
    ancestors.unshift(current);
    current = dirname(current);
  }
  return ancestors;
}

/**
 * Builds the full set of folder paths in a workspace by uniting explicit rows
 * with directories implied by stored file paths.
 */
export function deriveWorkspaceFolderPaths(
  files: readonly FileType[],
  explicitPaths: readonly string[],
): string[] {
  const paths = new Set<string>();
  for (const file of files) addSelfAndAncestors(paths, dirname(file.relativePath));
  for (const path of explicitPaths) addSelfAndAncestors(paths, path);
  return [...paths].sort((left, right) => left.localeCompare(right));
}

function addSelfAndAncestors(paths: Set<string>, path: string): void {
  let current = path;
  while (current) {
    paths.add(current);
    current = dirname(current);
  }
}

export interface FolderEntry {
  readonly name: string;
  readonly path: string;
}

export interface DirectoryListing {
  readonly folders: FolderEntry[];
  readonly files: FileType[];
}

/** Lists the immediate folders and files of one directory, folders first. */
export function listDirectoryContents(
  files: readonly FileType[],
  workspaceFolderPaths: readonly string[],
  currentPath: string,
): DirectoryListing {
  const folderEntries = new Map<string, string>();
  for (const path of workspaceFolderPaths) {
    if (dirname(path) === currentPath && path !== currentPath) {
      folderEntries.set(path, basename(path));
    }
  }

  return {
    folders: [...folderEntries.entries()]
      .map(([path, name]) => ({ name, path }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    files: files.filter((file) => dirname(file.relativePath) === currentPath),
  };
}

/** Counts owned files inside a folder subtree, used for delete confirmations. */
export function countFilesUnderPath(files: readonly FileType[], path: string): number {
  const prefix = `${path}/`;
  return files.filter((file) => file.relativePath.startsWith(prefix)).length;
}

export interface FolderTreeNode extends FolderEntry {
  readonly children: FolderTreeNode[];
}

/** Builds a nested sidebar tree from a list of folder paths. */
export function buildFolderTree(paths: readonly string[]): FolderTreeNode[] {
  const roots: FolderTreeNode[] = [];
  const nodesByPath = new Map<string, FolderTreeNode>();

  // Code-unit order places every path before its own extensions, so
  // ancestors are always processed before their descendants.
  const orderedPaths = [...paths].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  for (const path of orderedPaths) {
    const node: FolderTreeNode = { name: basename(path), path, children: [] };
    nodesByPath.set(path, node);
    const parentPath = dirname(path);
    const parent = nodesByPath.get(parentPath);
    if (parentPath && parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  sortTreeNodes(roots);
  return roots;
}

function sortTreeNodes(nodes: FolderTreeNode[]): void {
  nodes.sort((left, right) => left.name.localeCompare(right.name));
  for (const node of nodes) sortTreeNodes(node.children);
}
