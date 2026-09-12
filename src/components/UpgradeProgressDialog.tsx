import { CheckCircle2, CircleDashed, Info, Milestone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

const completed = ["S3-compatible private storage", "Hierarchy and approval policy", "Persistent notifications", "Role-aware dashboards"];
const planned = ["Trash and recovery", "Move and rename", "Detailed activity exports"];
const progress = Math.round((completed.length / (completed.length + planned.length)) * 100);

/** Shows durable release progress separately from file-upload progress. */
export function UpgradeProgressDialog(): React.JSX.Element {
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="What's new"><Info className="size-[18px]" /></Button></DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><div className="flex items-center gap-2"><Badge variant="secondary">v0.2.0</Badge><Badge variant="success">Current milestone</Badge></div><DialogTitle className="pt-2">DriveBox governance upgrade</DialogTitle><DialogDescription>Delivered and planned product capabilities for the current release line.</DialogDescription></DialogHeader>
        <div className="space-y-2"><div className="flex justify-between text-sm"><span className="font-medium">Scoped capability progress</span><span>{completed.length} of {completed.length + planned.length}</span></div><Progress value={progress} aria-label={`${completed.length} of ${completed.length + planned.length} scoped capabilities delivered`} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><section><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4 text-emerald-600" />Delivered</h3><ul className="space-y-2">{completed.map((item) => <li key={item} className="flex gap-2 text-sm text-muted-foreground"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />{item}</li>)}</ul></section><section><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Milestone className="size-4 text-primary" />Next</h3><ul className="space-y-2">{planned.map((item) => <li key={item} className="flex gap-2 text-sm text-muted-foreground"><CircleDashed className="mt-0.5 size-4 shrink-0" />{item}</li>)}</ul></section></div>
        <p className="text-xs text-muted-foreground">Last updated 7 September 2026 · This is release scope, not file-upload progress.</p>
      </DialogContent>
    </Dialog>
  );
}
