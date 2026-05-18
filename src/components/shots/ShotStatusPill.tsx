import type { ShotStatus } from "@/integrations/supabase/aliases";
import { SHOT_STATUS_OPTIONS, SHOT_STATUS_STYLES } from "@/lib/queries/shots";

const LABEL = Object.fromEntries(SHOT_STATUS_OPTIONS.map((o) => [o.value, o.label])) as Record<
  ShotStatus,
  string
>;

export function ShotStatusPill({ status }: { status: ShotStatus }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${SHOT_STATUS_STYLES[status]}`}
    >
      {LABEL[status]}
    </span>
  );
}
