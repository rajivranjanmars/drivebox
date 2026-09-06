import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Effect } from "effect";
import { listUserFiles, listUserFolders } from "@/server/file-service";
import { runFileEffect } from "@/server/runtime";
import { resolveSession } from "@/server/session";

export interface WorkspaceData {
  readonly files: Awaited<ReturnType<typeof runWorkspaceList>>;
  readonly folders: Awaited<ReturnType<typeof runWorkspaceFolderList>>;
  readonly user: {
    readonly id: string;
    readonly name: string;
  };
}

async function runWorkspaceList(userId: string) {
  return runFileEffect(listUserFiles(userId));
}

async function runWorkspaceFolderList(userId: string) {
  return runFileEffect(listUserFolders(userId));
}

/** Loads the authenticated workspace through Better Auth and the Effect file service. */
export const getWorkspace = createServerFn({ method: "GET" }).handler(async (): Promise<WorkspaceData | null> => {
  const session = await Effect.runPromise(resolveSession(getRequestHeaders()));
  if (!session) return null;

  return {
    files: await runWorkspaceList(session.user.id),
    folders: await runWorkspaceFolderList(session.user.id),
    user: {
      id: session.user.id,
      name: session.user.name,
    },
  };
});
