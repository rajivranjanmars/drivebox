import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>): React.JSX.Element {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn("fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border bg-card p-6 shadow-2xl", className)}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close dialog">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element => (
  <div className={cn("space-y-1.5 text-left", className)} {...props} />
);
export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element => (
  <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />
);
export const DialogTitle = ({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>): React.JSX.Element => (
  <DialogPrimitive.Title className={cn("text-xl font-semibold", className)} {...props} />
);
export const DialogDescription = ({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>): React.JSX.Element => (
  <DialogPrimitive.Description className={cn("text-sm leading-6 text-muted-foreground", className)} {...props} />
);
