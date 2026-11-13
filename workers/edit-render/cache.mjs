// Re-export of the shared cache rules. Node 22 runs this with --experimental-strip-types.
export {
  DEFAULT_CACHE_CAP_BYTES,
  DEFAULT_CACHE_TTL_MS,
  assetsToFetch,
  evictionPlan,
  isProtected,
  mayClearScratch,
} from "../../supabase/functions/_shared/workerCache.ts";
