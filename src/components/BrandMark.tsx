import { FolderLock } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrandMarkProps {
  compact?: boolean;
  className?: string;
  inverse?: boolean;
}

/** Renders the code-native DriveBox brand mark and optional wordmark. */
export function BrandMark({ compact = false, className, inverse = false }: BrandMarkProps): React.JSX.Element {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative grid size-9 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/20">
        <span className="absolute inset-px rounded-[11px] bg-gradient-to-br from-white/20 to-transparent" />
        <FolderLock className="relative size-[19px]" strokeWidth={2.25} />
      </span>
      {!compact && (
        <span className={cn("text-lg font-bold tracking-[-0.035em]", inverse ? "text-white" : "text-foreground")}>
          Drive<span className={inverse ? "text-white/80" : "text-primary"}>Box</span>
        </span>
      )}
    </span>
  );
}
