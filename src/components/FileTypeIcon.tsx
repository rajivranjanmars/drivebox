import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  type LucideIcon,
} from "lucide-react";
import { getFileCategory, type FileCategory } from "@/lib/file-presentation";
import { cn } from "@/lib/utils";

interface FileVisual {
  icon: LucideIcon;
  className: string;
  label: string;
}

interface FileTypeIconProps {
  filename: string;
  mimeType: string;
  className?: string;
}

const visuals: Record<FileCategory, FileVisual> = {
  archive: { icon: FileArchive, className: "bg-amber-500/10 text-amber-600 dark:text-amber-400", label: "Archive" },
  audio: { icon: FileAudio, className: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400", label: "Audio" },
  code: { icon: FileCode2, className: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400", label: "Code" },
  document: { icon: FileText, className: "bg-blue-500/10 text-blue-600 dark:text-blue-400", label: "Document" },
  file: { icon: File, className: "bg-slate-500/10 text-slate-600 dark:text-slate-400", label: "File" },
  image: { icon: FileImage, className: "bg-violet-500/10 text-violet-600 dark:text-violet-400", label: "Image" },
  sheet: { icon: FileSpreadsheet, className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", label: "Spreadsheet" },
  video: { icon: FileVideo, className: "bg-rose-500/10 text-rose-600 dark:text-rose-400", label: "Video" },
};

/** Renders a lightweight local icon treatment for a stored file. */
export function FileTypeIcon({ filename, mimeType, className }: FileTypeIconProps): React.JSX.Element {
  const visual = visuals[getFileCategory(mimeType, filename)];
  const Icon = visual.icon;

  return (
    <span
      title={visual.label}
      className={cn("grid size-10 shrink-0 place-items-center rounded-xl", visual.className, className)}
    >
      <Icon className="size-[18px]" aria-hidden="true" />
      <span className="sr-only">{visual.label}</span>
    </span>
  );
}
