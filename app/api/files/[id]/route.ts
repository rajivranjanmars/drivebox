import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { getDatabase } from "@/db";
import {
  buildContentDisposition,
  deleteOwnedFile,
  findOwnedFile,
} from "@/lib/files";
import { getCurrentSession } from "@/lib/session";

interface FileRouteContext {
  params: Promise<{ id: string }>;
}

/** Streams a private R2 object after checking its D1 ownership record. */
export async function GET(_request: Request, context: FileRouteContext): Promise<Response> {
  const currentSession = await getCurrentSession();
  if (!currentSession) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const record = await findOwnedFile(getDatabase(), currentSession.user.id, id);
  if (!record) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const { env } = getCloudflareContext();
  const object = await env.FILES.get(record.objectKey);
  if (!object) {
    console.error(JSON.stringify({ message: "R2 object missing", fileId: record.id }));
    return NextResponse.json({ error: "File content not found" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("content-type", record.mimeType);
  headers.set("content-length", String(record.size));
  headers.set("content-disposition", buildContentDisposition(record.filename));
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, no-store");

  return new Response(object.body, { headers });
}

/** Deletes a private R2 object and then its D1 metadata record. */
export async function DELETE(_request: Request, context: FileRouteContext): Promise<Response> {
  const currentSession = await getCurrentSession();
  if (!currentSession) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const database = getDatabase();
  const record = await findOwnedFile(database, currentSession.user.id, id);
  if (!record) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const { env } = getCloudflareContext();
  await env.FILES.delete(record.objectKey);
  await deleteOwnedFile(database, currentSession.user.id, id);

  return new Response(null, { status: 204 });
}
