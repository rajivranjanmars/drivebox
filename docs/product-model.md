# Product and authorization model

## Roles and hierarchy

DriveBox has one `superadmin` apex and a tree of `admin` and `member` profiles.

- The superadmin may create a direct child without another approval. Direct children are admins and each begins an isolated top-level entity.
- Admins may request a child account. A top-level admin's request is decided by the superadmin; a deeper admin's request is decided by that admin's immediate parent.
- Members cannot request users. A role change to admin is required first.
- The client supplies proposed name, email, and role only. Parent, approver, entity root, requester, and resulting capabilities are computed by the server.
- A pending request is not an authentication account. Approval issues a hashed, expiring, single-use invitation; accepting it creates the Better Auth account and active profile.

## Drive visibility

- Owners have read/write access to their own drive.
- An admin or superadmin may open a direct child's drive read-only.
- A user cannot open a parent's, sibling's, cousin's, or unrelated entity's drive.
- The superadmin can inspect global governance metadata but file-content access follows the same direct-child rule. Apex authority does not silently become unrestricted content access.
- All list and object operations enforce the actor/owner relationship on the server. A read capability never implies upload, rename, move, or delete.

## Approval lifecycle

Account requests move through `pending -> approved -> activated`, or terminate as `rejected`, `cancelled`, or `expired`.

1. An authorized actor submits a proposed child.
2. DriveBox computes the designated approver and persists the request.
3. The approver receives a persistent notification.
4. Approval creates an invitation token and notifies the requester; rejection requires a reason and notifies the requester.
5. The invitee accepts the invitation and chooses a password.
6. DriveBox creates the identity/profile once and records an audit event.

Every decision uses a compare-and-set from `pending`, so retries cannot produce two decisions or two accounts.

## Application shell

The authenticated UI follows a dense Google Drive-style shell: top search and notification controls; a responsive navigation rail; a prominent New menu; My Drive; People; Approvals; Notifications; and role-aware overview dashboards. Descendant-drive mode uses the normal file viewport with a persistent read-only owner banner and no mutation actions.

The What's New dialog shows application version and delivered/planned milestones. Upload progress stays in the upload surface rather than occupying that dialog.
