/**
 * Store factory. Track E: return RedisStore when Upstash env vars are present
 * (KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN), else MemoryStore.
 */
import type { Store } from "@/lib/contracts/store";
import { MemoryStore } from "./memory";

const globalForStore = globalThis as unknown as { __colearnStore?: Store };

export function getStore(): Store {
  globalForStore.__colearnStore ??= new MemoryStore();
  return globalForStore.__colearnStore;
}
