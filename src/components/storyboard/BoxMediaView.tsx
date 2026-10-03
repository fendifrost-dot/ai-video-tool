import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrevisFrame } from "@/components/treatment/PrevisFrame";
import type { StoryboardBox } from "@/lib/storyboard/boxes";
import type { AssignmentRole, BoxMediaItem } from "@/lib/storyboard/media";
import { RangeVideo } from "./RangeVideo";
import { useStoryboard } from "./useStoryboardController";

export const ROLE_LABEL: Record<AssignmentRole, string> = {
  performance: "Your take",
  b_roll: "Your B-roll",
  generated_clip: "AI clip",
  generated_image: "AI image",
  reference: "Reference",
};

export const ROLE_STYLE: Record<AssignmentRole, string> = {
  performance: "bg-violet-500/20 text-violet-200",
  b_roll: "bg-emerald-500/20 text-emerald-200",
  generated_clip: "bg-orange-500/20 text-orange-200",
  generated_image: "bg-orange-500/20 text-orange-200",
  reference: "bg-white/10 text-foreground/70",
};

export function mediaLabel(item: Pick<BoxMediaItem, "role" | "base">): string {
  return item.base ? "Your take · base layer" : ROLE_LABEL[item.role];
}

/** One piece of media, played or shown — always the whole frame, never cropped. */
export function MediaItemView({ item, url, mode, testId }: { item: BoxMediaItem; url: string | undefined; mode: "card" | "focus"; testId?: string }) {
  if (!url) {
    return (
      <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-white/50">
        <ImageOff className="h-4 w-4" /> loading…
      </div>
    );
  }
  if (item.kind === "image") {
    return (
      <img
        src={url}
        alt=""
        loading={mode === "card" ? "lazy" : "eager"}
        // the whole frame, on the board too: a tile that crops a vertical image shows a picture that was never made
        className="absolute inset-0 h-full w-full object-contain"
        data-testid={testId}
      />
    );
  }
  return (
    <div className="absolute inset-0">
      <RangeVideo
        src={url}
        start={item.sourceIn ?? 0}
        end={item.sourceOut}
        lazy={mode === "card"}
        autoPlay={mode === "focus"}
        showControls={mode === "focus"}
        testId={testId}
      />
    </div>
  );
}

/** What a box shows: its selected media, else the synced take underneath, else the drawn placeholder. */
export function BoxMediaView({ box, mode }: { box: StoryboardBox; mode: "card" | "focus" }) {
  const sb = useStoryboard();
  const item = sb.mediaOf(box.id).showing;
  if (!item) {
    return (
      <div className={cn(mode === "focus" && "mx-auto w-full max-w-4xl")} data-testid="box-media-empty">
        <PrevisFrame spec={box.spec} className={mode === "focus" ? "rounded-xl" : undefined} />
      </div>
    );
  }
  return (
    <div
      className={cn("relative w-full overflow-hidden bg-black", mode === "card" ? "aspect-video rounded-t-xl" : "h-full min-h-[40vh] rounded-xl")}
      data-testid="box-media"
      data-media-role={item.role}
      data-media-base={item.base ? "true" : "false"}
    >
      <MediaItemView item={item} url={sb.urlFor(item.asset)} mode={mode} testId="box-media-player" />
      <span className={cn("pointer-events-none absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-medium backdrop-blur", ROLE_STYLE[item.role])}>
        {mediaLabel(item)}
      </span>
      {item.note && (
        <span className="pointer-events-none absolute bottom-2 left-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-amber-200 backdrop-blur" data-testid="box-media-note">
          {item.note}
        </span>
      )}
    </div>
  );
}
