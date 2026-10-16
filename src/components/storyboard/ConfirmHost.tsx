import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Overlay } from "./Overlay";
import type { ConfirmRequest } from "./useStoryboardController";

/**
 * An in-page confirmation. Used for anything that spends money or cannot be taken back with one click, so the
 * amount and the consequence are read before the press. (In-page rather than a browser dialog: it shows the same
 * on a phone, and it never blocks the page — nor the next confirmation: work that was confirmed runs on its own.)
 */
export function ConfirmHost({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  if (!request) return null;
  const typed = () => (request.input ? (inputRef.current?.value ?? request.input.initial ?? "") : undefined);
  return (
    <Overlay>
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" data-testid="confirm-dialog" onClick={onClose}>
      <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-background p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold">{request.title}</h2>
        <p className="text-xs leading-relaxed text-foreground/70">{request.body}</p>
        {request.picture ? (
          <figure className="flex items-center gap-3 rounded-lg border border-border/60 bg-white/[0.03] p-2" data-testid="confirm-picture">
            {request.picture.url ? <img src={request.picture.url} alt="" className="h-24 w-auto rounded border border-border/50 object-contain" data-testid="confirm-picture-image" /> : null}
            <figcaption className="min-w-0 break-words text-[11px] leading-snug text-foreground/60">{request.picture.caption}</figcaption>
          </figure>
        ) : null}
        {request.input ? (
          <label className="block space-y-1 text-[11px] text-foreground/70">
            <span>{request.input.label}</span>
            <textarea
              ref={inputRef}
              defaultValue={request.input.initial ?? ""}
              placeholder={request.input.placeholder}
              maxLength={request.input.maxLength}
              rows={3}
              className="w-full rounded-md border border-border bg-white/[0.03] p-2 text-xs text-foreground placeholder:text-foreground/35"
              data-testid={request.input.testId}
            />
          </label>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={onClose} data-testid="confirm-cancel">
            Cancel
          </Button>
          {request.secondary && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const work = request.secondary!.onConfirm;
                const value = typed();
                onClose();
                void Promise.resolve()
                  .then(() => work(value))
                  .catch(() => undefined);
              }}
              data-testid={request.secondary.testId}
            >
              {request.secondary.label}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              // Close at once and let the work run: it reports its own progress on the shot it belongs to. Nothing is
              // held here while it runs — a clip takes minutes, and the next confirmation (another shot's image) must
              // not wait for it.
              const value = typed();
              onClose();
              void Promise.resolve()
                .then(() => request.onConfirm(value))
                .catch(() => undefined);
            }}
            data-testid={request.testId}
          >
            {request.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
    </Overlay>
  );
}
