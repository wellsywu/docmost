import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PublisherConfig } from "../config.js";

/**
 * Guards every `/api/` route with a shared bearer token. Whether the guard runs
 * is an explicit configuration flag, never inferred from how the token looks.
 */
export function registerAuth(
  app: FastifyInstance,
  config: PublisherConfig,
): void {
  if (!config.PUBLISHER_AUTH_ENABLED) return;
  const expected = Buffer.from(config.PUBLISHER_ACCESS_TOKEN, "utf8");

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    const supplied = Buffer.from(
      request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "",
      "utf8",
    );
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });
}
