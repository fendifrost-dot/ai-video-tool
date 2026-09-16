/**
 * SAM-3 consume / provenance for the reconstruct path.
 *
 * Never calls sam3-segment-proxy, Control Center, or any paid API.
 * Live SAM is unavailable on this lane; fixtures fill only when the
 * caller payload is missing or is a live-shaped path we refuse to fetch.
 */

import type { ConsumedSam3Mask, Sam3MaskSource } from "./adapters";
import { fixtureSam3Mask } from "./fixtures/liveWiringFixture";

export const SAM3_CONSUME_VERSION = "1.0.0";
export const SAM3_LIVE_FETCH_ATTEMPTED = false as const;

export type Sam3FallbackStatus =
  | "not_needed"
  | "live_unavailable_used_fixture"
  | "invalid_payload_refused"
  | "refused_no_fallback";

export type Sam3ConsumeFailure = {
  code:
    | "sam3_live_unavailable"
    | "sam3_invalid_payload"
    | "sam3_live_fetch_refused"
    | "sam3_size_mismatch";
  message: string;
};

export type Sam3MaskProvenance = {
  width: number;
  height: number;
  outfitPixelCount: number;
  repairPixelCount: number;
  outfitCoverage: number;
  repairCoverage: number;
  checksum: string;
};

export type Sam3ConsumeProvenance = {
  consumeVersion: typeof SAM3_CONSUME_VERSION;
  source: Sam3MaskSource;
  liveFetchAttempted: false;
  paidCalls: false;
  grokPerFrame: false;
  fallbackStatus: Sam3FallbackStatus;
  mask: Sam3MaskProvenance | null;
  failure: Sam3ConsumeFailure | null;
};

export type Sam3ConsumeOk = {
  ok: true;
  sam3: ConsumedSam3Mask;
  provenance: Sam3ConsumeProvenance;
};

export type Sam3ConsumeFail = {
  ok: false;
  sam3: null;
  provenance: Sam3ConsumeProvenance;
  code: Sam3ConsumeFailure["code"];
  message: string;
};

export type Sam3ConsumeResult = Sam3ConsumeOk | Sam3ConsumeFail;

export type ConsumeSam3ForReconstructInput = {
  /** Caller / live-shaped JSON. Omitted = live SAM unavailable. */
  raw?: unknown;
  expectedWidth: number;
  expectedHeight: number;
  /**
   * When live SAM is unavailable (default true), use the $0 fixture mask.
   * Invalid numeric payloads never fall back.
   */
  allowFixtureFallback?: boolean;
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function isFiniteInt(n: unknown): n is number {
  return isFiniteNumber(n) && Number.isInteger(n);
}

function coverage(alpha: Float32Array): { count: number; fraction: number } {
  let count = 0;
  for (let i = 0; i < alpha.length; i++) {
    if ((alpha[i] ?? 0) > 0.5) count++;
  }
  return { count, fraction: alpha.length === 0 ? 0 : count / alpha.length };
}

export function sam3MaskChecksum(outfit: Float32Array, repair?: Float32Array): string {
  let h = 2166136261;
  const mix = (v: number): void => {
    h ^= Math.round(v * 255) & 255;
    h = Math.imul(h, 16777619);
  };
  for (let i = 0; i < outfit.length; i++) mix(outfit[i] ?? 0);
  if (repair) {
    for (let i = 0; i < repair.length; i++) mix(repair[i] ?? 0);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function sam3MaskProvenanceFromAlpha(
  width: number,
  height: number,
  outfit: Float32Array,
  repair?: Float32Array,
): Sam3MaskProvenance {
  const outfitCov = coverage(outfit);
  const repairCov = repair ? coverage(repair) : { count: 0, fraction: 0 };
  return {
    width,
    height,
    outfitPixelCount: outfitCov.count,
    repairPixelCount: repairCov.count,
    outfitCoverage: outfitCov.fraction,
    repairCoverage: repairCov.fraction,
    checksum: sam3MaskChecksum(outfit, repair),
  };
}

function provenanceBase(
  extra: Omit<Sam3ConsumeProvenance, "consumeVersion" | "liveFetchAttempted" | "paidCalls" | "grokPerFrame">,
): Sam3ConsumeProvenance {
  return {
    consumeVersion: SAM3_CONSUME_VERSION,
    liveFetchAttempted: false,
    paidCalls: false,
    grokPerFrame: false,
    ...extra,
  };
}

function fail(
  failure: Sam3ConsumeFailure,
  fallbackStatus: Sam3FallbackStatus,
): Sam3ConsumeFail {
  return {
    ok: false,
    sam3: null,
    code: failure.code,
    message: failure.message,
    provenance: provenanceBase({
      source: "fixture",
      fallbackStatus,
      mask: null,
      failure,
    }),
  };
}

function okFixture(
  width: number,
  height: number,
  fallbackStatus: Extract<
    Sam3FallbackStatus,
    "live_unavailable_used_fixture" | "not_needed"
  >,
  source: Sam3MaskSource,
): Sam3ConsumeOk {
  const sam3 = fixtureSam3Mask(width, height);
  sam3.source = source;
  return {
    ok: true,
    sam3,
    provenance: provenanceBase({
      source,
      fallbackStatus,
      mask: sam3MaskProvenanceFromAlpha(width, height, sam3.outfitAlpha, sam3.repairAlpha),
      failure: null,
    }),
  };
}

function parseAlphaArray(raw: unknown, length: number, label: string): Float32Array | string {
  if (!Array.isArray(raw) && !(raw instanceof Float32Array)) {
    return `${label} must be a number array`;
  }
  const list = raw as ArrayLike<unknown>;
  if (list.length !== length) return `${label} length must be width*height`;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const v = list[i];
    if (!isFiniteNumber(v)) return `${label}[${i}] invalid`;
    out[i] = v > 1 ? Math.max(0, Math.min(1, v / 255)) : Math.max(0, Math.min(1, v));
  }
  return out;
}

function isLiveUnavailablePayload(raw: unknown): boolean {
  if (raw == null) return true;
  const rec = asRecord(raw);
  if (!rec) return true;
  if (rec.liveFetch === true) return true;
  if (typeof rec.maskPath === "string" && rec.maskPath.length > 0) return true;
  if (typeof rec.error === "string" && rec.outfitAlpha == null && rec.sam3 == null) return true;
  const nested = asRecord(rec.sam3);
  if (nested && typeof nested.maskPath === "string") return true;
  return false;
}

function extractMaskBody(raw: unknown): Record<string, unknown> | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const nested = asRecord(rec.sam3) ?? asRecord(rec.mask);
  if (nested && (nested.outfitAlpha != null || nested.width != null)) return nested;
  if (rec.outfitAlpha != null || rec.width != null) return rec;
  return null;
}

/**
 * Consume a SAM-3 payload for reconstruct. Does not fetch.
 */
export function consumeSam3ForReconstruct(input: ConsumeSam3ForReconstructInput): Sam3ConsumeResult {
  const { expectedWidth, expectedHeight } = input;
  const allowFallback = input.allowFixtureFallback !== false;

  if (expectedWidth < 1 || expectedHeight < 1) {
    return fail(
      { code: "sam3_size_mismatch", message: "expected SAM-3 raster is invalid" },
      "invalid_payload_refused",
    );
  }

  if (isLiveUnavailablePayload(input.raw)) {
    if (!allowFallback) {
      return fail(
        {
          code: "sam3_live_unavailable",
          message:
            "Live SAM-3 is unavailable and fixture fallback is disabled. Reconstruct does not call sam3-segment-proxy.",
        },
        "refused_no_fallback",
      );
    }
    if (asRecord(input.raw)?.liveFetch === true) {
      // Still fixture-fallback: we refuse the fetch, then use the $0 mask.
      const used = okFixture(
        expectedWidth,
        expectedHeight,
        "live_unavailable_used_fixture",
        "unavailable_fallback_fixture",
      );
      used.provenance.failure = {
        code: "sam3_live_fetch_refused",
        message: "liveFetch was requested; reconstruct never calls SAM-3 / CC / paid APIs.",
      };
      return used;
    }
    return okFixture(
      expectedWidth,
      expectedHeight,
      "live_unavailable_used_fixture",
      "unavailable_fallback_fixture",
    );
  }

  const body = extractMaskBody(input.raw);
  if (!body) {
    return fail(
      { code: "sam3_invalid_payload", message: "SAM-3 payload is not a mask object" },
      "invalid_payload_refused",
    );
  }

  if (!isFiniteInt(body.width) || !isFiniteInt(body.height)) {
    return fail(
      { code: "sam3_invalid_payload", message: "sam3.width/height invalid" },
      "invalid_payload_refused",
    );
  }
  if (body.width !== expectedWidth || body.height !== expectedHeight) {
    return fail(
      {
        code: "sam3_size_mismatch",
        message: `sam3 raster ${body.width}×${body.height} does not match original ${expectedWidth}×${expectedHeight}`,
      },
      "invalid_payload_refused",
    );
  }

  const n = expectedWidth * expectedHeight;
  const outfit = parseAlphaArray(body.outfitAlpha, n, "sam3.outfitAlpha");
  if (typeof outfit === "string") {
    return fail({ code: "sam3_invalid_payload", message: outfit }, "invalid_payload_refused");
  }
  let repair: Float32Array | undefined;
  if (body.repairAlpha != null) {
    const parsed = parseAlphaArray(body.repairAlpha, n, "sam3.repairAlpha");
    if (typeof parsed === "string") {
      return fail({ code: "sam3_invalid_payload", message: parsed }, "invalid_payload_refused");
    }
    repair = parsed;
  }

  const source: Sam3MaskSource = body.source === "fixture" ? "fixture" : "caller_supplied";
  const sam3: ConsumedSam3Mask = {
    width: expectedWidth,
    height: expectedHeight,
    outfitAlpha: outfit,
    repairAlpha: repair,
    source,
    liveFetch: false,
  };
  return {
    ok: true,
    sam3,
    provenance: provenanceBase({
      source,
      fallbackStatus: "not_needed",
      mask: sam3MaskProvenanceFromAlpha(expectedWidth, expectedHeight, outfit, repair),
      failure: null,
    }),
  };
}
