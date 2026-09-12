import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Effect } from "effect";
import { getDatabase } from "@/db";
import { listUserFiles, listUserFolders } from "@/server/file-service";
import { getGovernanceDashboard, resolveDriveAccess } from "@/server/governance";
import { runFileEffect } from "@/server/runtime";
import { resolveSession } from "@/server/session";

export interface WorkspaceData {
  readonly files: Awaited<ReturnType<typeof runWorkspaceList>>;
  readonly folders: Awaited<ReturnType<typeof runWorkspaceFolderList>>;
  readonly user: {
    readonly id: string;
    readonly name: string;
  };
  readonly drive: Awaited<ReturnType<typeof resolveDriveAccess>>;
  readonly governance: Awaited<ReturnType<typeof getGovernanceDashboard>>;
}

async function runWorkspaceList(userId: string) {
  return runFileEffect(listUserFiles(userId));
}

async function runWorkspaceFolderList(userId: string) {
  return runFileEffect(listUserFolders(userId));
}

/** Loads the authenticated workspace through Better Auth and the Effect file service. */
export const getWorkspace = createServerFn({ method: "GET" })
  .validator((input: { ownerId?: string } | undefined) => ({
    ownerId: typeof input?.ownerId === "string" && input.ownerId.length <= 128 ? input.ownerId : undefined,
  }))
  .handler(async ({ data }): Promise<WorkspaceData | null> => {
  const session = await Effect.runPromise(resolveSession(getRequestHeaders()));
  if (!session) return null;

  const database = getDatabase();
  const drive = await resolveDriveAccess(database, session.user.id, data.ownerId);
  const files = await runWorkspaceList(drive.ownerId);

  return {
    files: drive.access === "owner"
      ? files
      : files.map((file) => ({ ...file, downloadURL: `${file.downloadURL}?owner=${encodeURIComponent(drive.ownerId)}` })),
    folders: await runWorkspaceFolderList(drive.ownerId),
    drive,
    governance: await getGovernanceDashboard(database, session.user.id),
    user: {
      id: session.user.id,
      name: session.user.name,
    },
  };
});
