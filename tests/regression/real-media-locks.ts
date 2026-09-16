/**
 * Lane R real-media lock table. Placeholders only — UNCLAIMED until owning
 * lanes land evidence. Do not invent PASS. Do not import paint/temporal/
 * reconstruct/eval product modules.
 */

export const REAL_MEDIA_LOCK_STATUSES = ["UNCLAIMED", "CLAIMED", "BLOCKED"] as const;
export type RealMediaLockStatus = (typeof REAL_MEDIA_LOCK_STATUSES)[number];

export const REAL_MEDIA_CLAIMED_VERDICTS = ["PASS", "FAIL", "INCOMPLETE"] as const;
export type RealMediaClaimedVerdict = (typeof REAL_MEDIA_CLAIMED_VERDICTS)[number];

export const REQUIRED_REAL_MEDIA_LOCK_IDS = [
  "full-clip-temporal-qa",
  "original-master-preservation-video",
  "playable-mp4-provenance-76fe7438",
  "sam3-consume-evidence",
  "e2-video-qa-json",
] as const;

export interface RealMediaEvidence {
  path: string;
  issue: number;
  paidCalls: false;
  grokPerFrame?: false;
  sam3LiveFetch?: false;
  notes?: string;
}

export interface RealMediaLock {
  id: string;
  owningLane: string;
  owningIssue: number;
  claim: string;
  status: RealMediaLockStatus;
  verdict: RealMediaClaimedVerdict | null;
  evidence: RealMediaEvidence | null;
  notThis: string;
  evidenceRequired: string[];
  doNotEditFromLaneR: string[];
}

export interface RealMediaLockTable {
  schemaVersion: string;
  paidCalls: boolean;
  grokPerFrame: boolean;
  sam3LiveFetch: boolean;
  inventPassForbidden: boolean;
  taxonomyCategory: string;
  canonical: { masterClipId: string };
  notSubstitutes: string[];
  locks: RealMediaLock[];
}

export function assertRealMediaLockTable(table: RealMediaLockTable): string[] {
  const errors: string[] = [];
  if (table.paidCalls !== false) errors.push("paidCalls must be false");
  if (table.grokPerFrame !== false) errors.push("grokPerFrame must be false");
  if (table.sam3LiveFetch !== false) errors.push("sam3LiveFetch must be false");
  if (table.inventPassForbidden !== true) errors.push("inventPassForbidden must be true");
  if (table.taxonomyCategory !== "Real-Media-Benchmark") {
    errors.push("taxonomyCategory must be Real-Media-Benchmark");
  }
  if (table.canonical.masterClipId !== "76fe7438-671d-4428-a7f6-17a45e98c16f") {
    errors.push("canonical.masterClipId must stay 76fe7438");
  }

  const ids = table.locks.map((lock) => lock.id);
  for (const required of REQUIRED_REAL_MEDIA_LOCK_IDS) {
    if (!ids.includes(required)) errors.push(`missing lock ${required}`);
  }

  for (const lock of table.locks) {
    if (!REAL_MEDIA_LOCK_STATUSES.includes(lock.status)) {
      errors.push(`${lock.id}: invalid status ${lock.status}`);
      continue;
    }
    if (lock.status === "UNCLAIMED") {
      if (lock.verdict !== null) {
        errors.push(
          `${lock.id}: UNCLAIMED must keep verdict null (do not invent ${String(lock.verdict)})`,
        );
      }
      if (lock.evidence !== null) {
        errors.push(`${lock.id}: UNCLAIMED must keep evidence null`);
      }
    }
    if (lock.status === "CLAIMED") {
      if (lock.verdict === null || !REAL_MEDIA_CLAIMED_VERDICTS.includes(lock.verdict)) {
        errors.push(`${lock.id}: CLAIMED needs verdict PASS|FAIL|INCOMPLETE`);
      }
      if (!lock.evidence?.path) {
        errors.push(`${lock.id}: CLAIMED needs evidence.path from the owning lane`);
      }
      if (lock.evidence && lock.evidence.paidCalls !== false) {
        errors.push(`${lock.id}: evidence.paidCalls must be false`);
      }
      if (lock.evidence && lock.evidence.issue !== lock.owningIssue) {
        errors.push(`${lock.id}: evidence.issue must be owningIssue ${lock.owningIssue}`);
      }
    }
  }
  return errors;
}

export function unclaimedLockCount(table: RealMediaLockTable): number {
  return table.locks.filter((lock) => lock.status === "UNCLAIMED").length;
}
