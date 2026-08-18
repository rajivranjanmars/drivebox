/** Provides a minimal executable Worker entrypoint for binding-backed tests. */
export default {
  /** Returns a deterministic response when the test Worker is invoked directly. */
  async fetch(): Promise<Response> {
    return new Response("DriveBox test worker");
  },
} satisfies ExportedHandler<CloudflareEnv>;
