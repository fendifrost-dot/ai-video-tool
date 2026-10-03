import { Button } from "@/components/ui/button";
import { Overlay } from "./Overlay";
import type { ConfirmRequest } from "./useStoryboardController";

/**
 * An in-page confirmation. Used for anything that spends money or cannot be taken back with one click, so the
 * amount and the consequence are read before the press. (In-page rather than a browser dialog: it shows the same
 * on a phone, and it never blocks the page — nor the next confirmation: work that was confirmed runs on its own.)
 */
export function ConfirmHost({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  if (!request) return null;
  return (
    <Overlay>
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" data-testid="confirm-dialog" onClick={onClose}>
      <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-background p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold">{request.title}</h2>
        <p className="text-xs leading-relaxed text-foreground/70">{request.body}</p>
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={onClose} data-testid="confirm-cancel">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              // Close at once and let the work run: it reports its own progress on the shot it belongs to. Nothing is
              // held here while it runs — a clip takes minutes, and the next confirmation (another shot's image) must
              // not wait for it.
              onClose();
              void Promise.resolve()
                .then(() => request.onConfirm())
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
