import { createFileRoute } from "@tanstack/react-router";
import { UploadValidationError } from "@/lib/files";
import { json, withAuthenticatedUser } from "@/server/api-response";
import { uploadUserPart } from "@/server/file-service";
import { runFileEffect } from "@/server/runtime";

async function uploadPart(
  request: Request,
  uploadId: string,
  rawPartNumber: string,
): Promise<Response> {
  return withAuthenticatedUser(request, async (userId) => {
    if (!request.body) throw new UploadValidationError("An upload part body is required");
    const partNumber = Number(rawPartNumber);
    const size = Number(request.headers.get("x-part-size") ?? request.headers.get("content-length"));
    if (!Number.isSafeInteger(partNumber) || !Number.isSafeInteger(size) || size <= 0) {
      throw new UploadValidationError("The upload part number or size is invalid");
    }

    const result = await runFileEffect(uploadUserPart({
      userId,
      uploadId,
      partNumber,
      size,
      body: request.body,
    }));
    return json(result);
  });
}

export const Route = createFileRoute("/api/uploads/$uploadId/parts/$partNumber")({
  server: {
    handlers: {
      PUT: ({ request, params }) => uploadPart(request, params.uploadId, params.partNumber),
    },
  },
});
