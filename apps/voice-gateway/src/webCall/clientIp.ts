import { resolveTrustedClientIpKey } from "@lobbystack/config";
import type { FastifyInstance, FastifyRequest } from "fastify";

/**
 * Resolve the web-call client identity from the deployment's opted-in ingress
 * header. The same helper backs both the local rate-limit key and the abuse
 * `ipHash`, so a client cannot forge one path into a different identity than
 * the other. Unattributable requests fail closed onto one shared bucket.
 */
export function resolveWebCallClientKey(
  server: FastifyInstance,
  request: FastifyRequest,
): string {
  return resolveTrustedClientIpKey({
    headers: request.headers,
    peerIp: request.ip,
    trustProxy: server.runtimeConfig.VOICE_GATEWAY_TRUST_PROXY !== false,
  });
}
