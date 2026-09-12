import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

export function Progress({ className, value = 0, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>): React.JSX.Element {
  const safeValue = value ?? 0;
  return (
    <ProgressPrimitive.Root className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)} value={safeValue} {...props}>
      <ProgressPrimitive.Indicator className="h-full bg-primary transition-transform" style={{ transform: `translateX(-${100 - safeValue}%)` }} />
    </ProgressPrimitive.Root>
  );
}
