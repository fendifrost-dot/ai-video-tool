import { useMemo, useState } from "react";
import { useCharacterFeatures } from "@/lib/queries/characterFeatures";
import type { FeatureType } from "@/lib/queries/characterFeatures";
import {
  FEATURE_TAXONOMY,
  FEATURE_TYPES_ORDERED,
  formatFeatureType,
} from "./featureTaxonomy";
import { FeatureSlot } from "./FeatureSlot";

/**
 * Tabbed Character DNA editor. Replaces the legacy single asset grid for the
 * primary artist-identity workflow. Per feature type (face/teeth/hands/…)
 * shows a grid of canonical sub-pose slots with upload + toggles.
 */
export function CharacterDNATabs({ artistId }: { artistId: string }) {
  const featuresQuery = useCharacterFeatures(artistId);
  const features = useMemo(() => featuresQuery.data ?? [], [featuresQuery.data]);

  const [active, setActive] = useState<FeatureType>("face");

  const lockedCounts = useMemo(() => {
    const counts: Record<FeatureType, number> = {
      face: 0,
      hair: 0,
      teeth: 0,
      hands: 0,
      tattoos: 0,
      jewelry: 0,
      body: 0,
    };
    for (const f of features) {
      if (f.is_locked) counts[f.feature_type] += 1;
    }
    return counts;
  }, [features]);

  const filledCounts = useMemo(() => {
    const counts: Record<FeatureType, number> = {
      face: 0,
      hair: 0,
      teeth: 0,
      hands: 0,
      tattoos: 0,
      jewelry: 0,
      body: 0,
    };
    const seen = new Set<string>();
    for (const f of features) {
      const key = `${f.feature_type}::${f.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counts[f.feature_type] += 1;
    }
    return counts;
  }, [features]);

  const activeTaxonomy = FEATURE_TAXONOMY[active];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Character DNA
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Per-feature reference taxonomy. The compiler uses every <em>locked</em> feature in
          every prompt.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-md border border-border bg-muted/20 p-1">
        {FEATURE_TYPES_ORDERED.map((t) => {
          const slotCount = FEATURE_TAXONOMY[t].labels.length;
          const filled = filledCounts[t];
          const locked = lockedCounts[t];
          const isActive = t === active;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setActive(t)}
              className={[
                "rounded-sm px-3 py-1.5 text-xs font-medium transition",
                isActive
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              {formatFeatureType(t)}
              <span className="ml-1.5 text-[10px] opacity-70">
                {filled}/{slotCount}
                {locked > 0 && (
                  <span className="ml-1 rounded-sm bg-emerald-500/80 px-1 text-white">
                    🔒{locked}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-md border border-border p-3">
        <p className="text-xs text-muted-foreground">{activeTaxonomy.description}</p>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {activeTaxonomy.labels.map((label) => (
            <FeatureSlot
              key={`${active}-${label}`}
              artistId={artistId}
              featureType={active}
              label={label}
              features={features}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
