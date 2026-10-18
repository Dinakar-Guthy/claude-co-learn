/**
 * Store factory: a process-wide RedisStore when Upstash env vars are present
 * (KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN), else MemoryStore.
 */
import type { Store } from "@/lib/contracts/store";
import { MemoryStore } from "./memory";
import { RedisStore } from "./redis";
import { createUpstashKv, upstashCredentials } from "./redis-kv";
import { tagTestEvents } from "./testTraffic";

export { StoreError, isStoreError, STORE_ERROR_MESSAGE } from "./errors";

const globalForStore = globalThis as unknown as { __colearnStore?: Store };

export function storeKind(): "redis" | "memory" {
  return upstashCredentials() ? "redis" : "memory";
}

export function getStore(): Store {
  if (!globalForStore.__colearnStore) {
    const creds = upstashCredentials();
    globalForStore.__colearnStore = tagTestEvents(creds ? new RedisStore(createUpstashKv(creds)) : new MemoryStore());
  }
  return globalForStore.__colearnStore;
}
