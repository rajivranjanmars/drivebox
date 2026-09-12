import {
  Bell,
  Check,
  CheckCircle2,
  Clipboard,
  Clock3,
  Eye,
  ShieldCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { WorkspaceData } from "@/server/workspace.functions";

export type GovernanceView = "overview" | "people" | "approvals" | "notifications";

interface GovernancePanelProps {
  readonly data: WorkspaceData["governance"];
  readonly onViewDrive: (ownerId: string) => void;
  readonly view: GovernanceView;
}

interface MutationResult {
  readonly error?: string;
  readonly invitationToken?: string | null;
  readonly status?: string;
}

async function postGovernance(payload: Record<string, unknown>): Promise<MutationResult> {
  const response = await fetch("/api/governance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = response.status === 204 ? {} : await response.json() as MutationResult;
  if (!response.ok) throw new Error(result.error || "The request could not be completed");
  return result;
}

function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusVariant(status: string): "success" | "warning" | "outline" {
  return status === "approved" || status === "activated" || status === "active" ? "success"
    : status === "pending" ? "warning"
    : "outline";
}

/** Role-aware administration, approval, people, and notification dashboards. */
export function GovernancePanel({ data, onViewDrive, view }: GovernancePanelProps): React.JSX.Element {
  const router = useRouter();
  const [requestOpen, setRequestOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const isAdmin = data.profile.role === "admin" || data.profile.role === "superadmin";
  const pendingApprovals = data.requests.filter((request) => request.approverId === data.profile.userId && request.status === "pending");
  const unreadCount = data.notifications.filter((notification) => !notification.readAt).length;

  async function submitRequest(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setInvitationToken(null);
    const form = new FormData(event.currentTarget);
    try {
      const result = await postGovernance({
        action: "request-user",
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        role: data.profile.role === "superadmin" ? "admin" : String(form.get("role") ?? "member"),
      });
      if (result.invitationToken) {
        setInvitationToken(result.invitationToken);
      } else {
        setRequestOpen(false);
      }
      await router.invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The request failed");
    }
  }

  async function decide(requestId: string, decision: "approve" | "reject", reason?: string): Promise<void> {
    setBusyId(requestId);
    setError(null);
    try {
      const result = await postGovernance({ action: "decide-request", requestId, decision, reason });
      setRejectingId(null);
      if (result.invitationToken) setInvitationToken(result.invitationToken);
      await router.invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The decision failed");
    } finally {
      setBusyId(null);
    }
  }

  async function reissueInvitation(requestId: string, transitionNonce: string): Promise<void> {
    setBusyId(requestId);
    setError(null);
    try {
      const result = await postGovernance({ action: "reissue-invitation", requestId, transitionNonce });
      if (result.invitationToken) setInvitationToken(result.invitationToken);
      await router.invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The invitation could not be issued");
    } finally {
      setBusyId(null);
    }
  }

  if (view === "overview") {
    return (
      <section aria-labelledby="overview-title" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Badge variant="secondary">{data.profile.role}</Badge>
            <h1 id="overview-title" className="mt-3 text-2xl font-semibold tracking-tight">Branch overview</h1>
            <p className="mt-1 text-sm text-muted-foreground">People, approvals, and activity for the branch you manage.</p>
          </div>
          {isAdmin && <RequestUserButton open={requestOpen} onOpenChange={setRequestOpen} onSubmit={submitRequest} role={data.profile.role} error={error} />}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard icon={<Users />} label="Managed branch" value={data.hierarchy.length} />
          <MetricCard icon={<Clock3 />} label="Pending approvals" value={pendingApprovals.length} />
          <MetricCard icon={<Bell />} label="Unread notifications" value={unreadCount} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Approval queue</CardTitle>
            <CardDescription>Requests routed to you by immediate child admins.</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingApprovals.length === 0 ? (
              <p className="rounded-xl bg-muted/60 p-6 text-center text-sm text-muted-foreground">Nothing needs your approval.</p>
            ) : (
              <RequestRows requests={pendingApprovals.slice(0, 5)} busyId={busyId} onApprove={(id) => decide(id, "approve")} onReject={setRejectingId} />
            )}
          </CardContent>
        </Card>
        <TokenDialog token={invitationToken} onOpenChange={(open) => !open && setInvitationToken(null)} />
        <RejectDialog requestId={rejectingId} onOpenChange={(open) => !open && setRejectingId(null)} onReject={decide} />
      </section>
    );
  }

  if (view === "people") {
    return (
      <section aria-labelledby="people-title" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h1 id="people-title" className="text-2xl font-semibold tracking-tight">People</h1><p className="mt-1 text-sm text-muted-foreground">Your direct children. Their drives are available to you read-only.</p></div>
          {isAdmin && <RequestUserButton open={requestOpen} onOpenChange={setRequestOpen} onSubmit={submitRequest} role={data.profile.role} error={error} />}
        </div>
        <Card className="overflow-hidden">
          {data.hierarchy.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">No child accounts yet.</p> : (
            <ul className="divide-y">
              {data.hierarchy.map((child) => (
                <li key={child.id} className="flex flex-wrap items-center gap-3 p-4" style={{ paddingLeft: `${16 + child.depth * 24}px` }}>
                  <span className="grid size-10 place-items-center rounded-full bg-blue-100 font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-200">{child.name.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{child.name}</span><span className="block truncate text-sm text-muted-foreground">{child.email}{child.depth > 0 ? ` · level ${child.depth + 1}` : " · direct child"}</span></span>
                  <Badge variant="outline">{child.role}</Badge><Badge variant={statusVariant(child.status)}>{child.status}</Badge>
                  {child.depth === 0 && <Button variant="outline" size="sm" onClick={() => onViewDrive(child.id)}><Eye className="mr-2 size-4" />View drive</Button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <TokenDialog token={invitationToken} onOpenChange={(open) => !open && setInvitationToken(null)} />
      </section>
    );
  }

  if (view === "approvals") {
    return (
      <section aria-labelledby="approvals-title" className="space-y-5">
        <div><h1 id="approvals-title" className="text-2xl font-semibold tracking-tight">Approvals</h1><p className="mt-1 text-sm text-muted-foreground">Requests are decided only by their computed parent approver.</p></div>
        {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <Card className="overflow-hidden">
          {data.requests.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">No account requests yet.</p> : (
            <RequestRows requests={data.requests} busyId={busyId} onApprove={(id) => decide(id, "approve")} onReject={setRejectingId} onReissue={reissueInvitation} actorId={data.profile.userId} />
          )}
        </Card>
        <TokenDialog token={invitationToken} onOpenChange={(open) => !open && setInvitationToken(null)} />
        <RejectDialog requestId={rejectingId} onOpenChange={(open) => !open && setRejectingId(null)} onReject={decide} />
      </section>
    );
  }

  return (
    <section aria-labelledby="notifications-title" className="space-y-5">
      <div><h1 id="notifications-title" className="text-2xl font-semibold tracking-tight">Notifications</h1><p className="mt-1 text-sm text-muted-foreground">Persistent branch and approval updates.</p></div>
      <Card className="overflow-hidden">
        {data.notifications.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">You're all caught up.</p> : (
          <ul className="divide-y">
            {data.notifications.map((notification) => (
              <li key={notification.id} className={`flex gap-3 p-4 ${notification.readAt ? "" : "bg-blue-50/70 dark:bg-blue-950/20"}`}>
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Bell className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="font-medium">{notification.title}</span><span className="mt-1 block text-sm text-muted-foreground">{notification.message}</span><time className="mt-2 block text-xs text-muted-foreground" dateTime={new Date(notification.createdAt).toISOString()}>{formatDate(notification.createdAt)}</time></span>
                {!notification.readAt && <Button variant="ghost" size="sm" onClick={async () => { await postGovernance({ action: "read-notification", notificationId: notification.id }); await router.invalidate(); }}><Check className="mr-1 size-4" />Read</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }): React.JSX.Element {
  return <Card><CardContent className="flex items-center gap-4 p-5"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary [&>svg]:size-5">{icon}</span><span><strong className="block text-2xl">{value}</strong><span className="text-sm text-muted-foreground">{label}</span></span></CardContent></Card>;
}

function RequestRows({ requests, busyId, onApprove, onReject, onReissue, actorId }: {
  requests: WorkspaceData["governance"]["requests"];
  busyId: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onReissue?: (id: string, transitionNonce: string) => void;
  actorId?: string;
}): React.JSX.Element {
  return <ul className="divide-y">{requests.map((request) => {
    const canDecide = request.status === "pending" && (!actorId || request.approverId === actorId);
    const canReissue = request.status === "approved" && Boolean(onReissue) && Boolean(actorId) && (request.requesterId === actorId || request.approverId === actorId);
    return <li key={request.id} className="flex flex-wrap items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-full bg-muted"><UserPlus className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate font-medium">{request.requestedName}</span><span className="block truncate text-sm text-muted-foreground">{request.requestedEmail} · {request.requestedRole}</span><time className="mt-1 block text-xs text-muted-foreground">{formatDate(request.createdAt)}</time></span><Badge variant={statusVariant(request.status)}>{request.status}</Badge>{canDecide && <span className="flex gap-2"><Button size="sm" disabled={busyId === request.id} onClick={() => onApprove(request.id)}><CheckCircle2 className="mr-1 size-4" />Approve</Button><Button size="sm" variant="outline" disabled={busyId === request.id} onClick={() => onReject(request.id)}><XCircle className="mr-1 size-4" />Reject</Button></span>}{canReissue && <Button size="sm" variant="outline" disabled={busyId === request.id} onClick={() => onReissue?.(request.id, request.transitionNonce)}><Clipboard className="mr-1 size-4" />Get new code</Button>}</li>;
  })}</ul>;
}

function RequestUserButton({ open, onOpenChange, onSubmit, role, error }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; role: string; error: string | null }): React.JSX.Element {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogTrigger asChild><Button><UserPlus className="mr-2 size-4" />Request user</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Request a child account</DialogTitle><DialogDescription>{role === "superadmin" ? "Direct apex children are admins and are approved immediately." : "Your immediate parent will review this request before an account can be activated."}</DialogDescription></DialogHeader><form onSubmit={onSubmit} className="space-y-4"><label className="block space-y-1.5 text-sm font-medium">Full name<input name="name" required minLength={2} maxLength={120} className="h-11 w-full rounded-xl border bg-background px-3 font-normal" /></label><label className="block space-y-1.5 text-sm font-medium">Email<input name="email" type="email" required className="h-11 w-full rounded-xl border bg-background px-3 font-normal" /></label>{role !== "superadmin" && <label className="block space-y-1.5 text-sm font-medium">Role<select name="role" className="h-11 w-full rounded-xl border bg-background px-3 font-normal"><option value="member">Member</option><option value="admin">Admin</option></select></label>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button type="submit"><ShieldCheck className="mr-2 size-4" />{role === "superadmin" ? "Create approved invitation" : "Send for approval"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function TokenDialog({ token, onOpenChange }: { token: string | null; onOpenChange: (open: boolean) => void }): React.JSX.Element {
  return <Dialog open={Boolean(token)} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Invitation approved</DialogTitle><DialogDescription>This code is shown once. Send it to the approved person through a trusted channel; only the matching email can use it.</DialogDescription></DialogHeader><code className="break-all rounded-xl bg-muted p-4 text-sm">{token}</code><DialogFooter><Button onClick={() => { if (token) void navigator.clipboard.writeText(token); }}><Clipboard className="mr-2 size-4" />Copy code</Button></DialogFooter></DialogContent></Dialog>;
}

function RejectDialog({ requestId, onOpenChange, onReject }: { requestId: string | null; onOpenChange: (open: boolean) => void; onReject: (id: string, decision: "reject", reason: string) => void }): React.JSX.Element {
  return <Dialog open={Boolean(requestId)} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Reject account request</DialogTitle><DialogDescription>Give the requester a clear reason. Rejection is final for this request.</DialogDescription></DialogHeader><form onSubmit={(event) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get("reason") ?? ""); if (requestId) onReject(requestId, "reject", reason); }} className="space-y-4"><textarea name="reason" required maxLength={500} className="min-h-28 w-full rounded-xl border bg-background p-3 text-sm" placeholder="Reason for rejection" /><DialogFooter><Button type="submit" variant="destructive">Reject request</Button></DialogFooter></form></DialogContent></Dialog>;
}
