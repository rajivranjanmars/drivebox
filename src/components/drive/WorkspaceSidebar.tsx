import { ChevronRight, Files, Folder, HardDrive } from "lucide-react";
import prettyBytes from "pretty-bytes";
import { useEffect, useMemo, useState } from "react";
import {
  buildFolderTree,
  dirname,
  type FolderTreeNode,
} from "@/lib/file-presentation";
import { cn } from "@/lib/utils";

interface WorkspaceSidebarProps {
  folderPaths: string[];
  activePath: string;
  totalSize: number;
  fileCount: number;
  onNavigate: (path: string) => void;
}

interface FolderTreeProps {
  nodes: FolderTreeNode[];
  activePath: string;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onNavigate: (path: string) => void;
}

interface TreeNodeProps extends FolderTreeProps {
  node: FolderTreeNode;
  depth: number;
}

/** Renders one expandable sidebar tree row and its children. */
function TreeNode({ node, depth, activePath, expandedPaths, onToggle, onNavigate }: TreeNodeProps): React.JSX.Element {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedPaths.has(node.path);
  const isActive = activePath === node.path;
  const isAncestorActive = activePath.startsWith(`${node.path}/`);

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-0.5 rounded-lg pr-1 transition",
          isActive ? "bg-primary/[0.08] text-primary" : "hover:bg-muted",
        )}
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.path)}
            aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            aria-expanded={isExpanded}
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={cn("size-3.5 transition-transform", isExpanded && "rotate-90")} />
          </button>
        ) : (
          <span className="size-6 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={() => onNavigate(node.path)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 text-left text-sm"
          title={node.name}
        >
          <Folder
            className={cn(
              "size-4 shrink-0",
              isActive || isAncestorActive ? "text-primary" : "text-amber-500 dark:text-amber-400",
            )}
            aria-hidden="true"
          />
          <span className={cn("truncate", (isActive || isAncestorActive) && "font-semibold")}>{node.name}</span>
        </button>
      </div>
      {hasChildren && isExpanded && (
        <ul role="list">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Renders the Drive-style navigation rail with the workspace folder tree. */
export default function WorkspaceSidebar({
  folderPaths,
  activePath,
  totalSize,
  fileCount,
  onNavigate,
}: WorkspaceSidebarProps): React.JSX.Element {
  const tree = useMemo(() => buildFolderTree(folderPaths), [folderPaths]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());

  // Reveal the active branch whenever the location changes.
  useEffect(() => {
    if (!activePath) return;
    setExpandedPaths((current) => {
      const next = new Set(current);
      let ancestor = dirname(activePath);
      while (ancestor) {
        next.add(ancestor);
        ancestor = dirname(ancestor);
      }
      return next;
    });
  }, [activePath]);

  /** Toggles one branch between collapsed and expanded. */
  function toggle(path: string): void {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-4 self-start lg:sticky lg:top-20 lg:flex">
      <nav aria-label="Workspace folders" className="surface rounded-2xl p-3">
        <button
          type="button"
          onClick={() => onNavigate("")}
          aria-current={activePath === "" ? "page" : undefined}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition",
            activePath === "" ? "bg-primary/[0.08] font-semibold text-primary" : "hover:bg-muted",
          )}
        >
          <HardDrive className="size-4 shrink-0" aria-hidden="true" />
          My Files
        </button>

        {tree.length > 0 && (
          <>
            <p className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Folders
            </p>
            <ul role="list">
              {tree.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  activePath={activePath}
                  expandedPaths={expandedPaths}
                  onToggle={toggle}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          </>
        )}

        {tree.length === 0 && (
          <p className="mt-3 px-3 text-xs leading-5 text-muted-foreground">
            No folders yet. Create one or upload a folder to see its structure here.
          </p>
        )}
      </nav>

      <section aria-label="Storage summary" className="surface rounded-2xl p-4">
        <span className="grid size-10 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <Files className="size-5" aria-hidden="true" />
        </span>
        <p className="mt-3 text-lg font-bold tracking-tight">{prettyBytes(totalSize)}</p>
        <p className="text-xs text-muted-foreground">
          {fileCount} {fileCount === 1 ? "file" : "files"} · private object storage
        </p>
      </section>
    </aside>
  );
}
