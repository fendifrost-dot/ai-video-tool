import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Overlay } from "./Overlay";
import type { ConfirmRequest } from "./useStoryboardController";

/**
 * An in-page confirmation. Used for anything that spends money or cannot be taken back with one click, so the
 * amount and the consequence are read before the press. (In-page rather than a browser dialog: it shows the same
 * on a phone, and it never blocks the page.)
 */
export function ConfirmHost({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const [working, setWorking] = useState(false);
  if (!request) return null;
  return (
    <Overlay>
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" data-testid="confirm-dialog" onClick={() => !working && onClose()}>
      <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-background p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold">{request.title}</h2>
        <p className="text-xs leading-relaxed text-foreground/70">{request.body}</p>
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={working} data-testid="confirm-cancel">
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={working}
            onClick={() => {
              setWorking(true);
              // close at once: the work reports its own progress on the shot it belongs to
              onClose();
              void Promise.resolve(request.onConfirm()).finally(() => setWorking(false));
            }}
            data-testid={request.testId}
          >
            {working && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {request.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
    </Overlay>
  );
}
