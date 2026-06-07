import { Check, X } from "lucide-react";
import type { ApprovalStatus } from "@/integrations/supabase/aliases";
import { Button } from "@/components/ui/button";

/** Shared approve / reject controls used on asset cards and the review scorecard. */
export function ClipDecision({
  status,
  onApprove,
  onReject,
  disabled = false,
  size = "sm",
  approveLabel = "Approve",
  rejectLabel = "Reject",
}: {
  status?: ApprovalStatus;
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
  size?: "sm" | "default";
  approveLabel?: string;
  rejectLabel?: string;
}) {
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        size={size}
        variant={status === "approved" ? "default" : "outline"}
        onClick={onApprove}
        disabled={disabled}
        className={size === "sm" ? "h-7 px-2 text-xs" : undefined}
      >
        <Check className="mr-1 h-3 w-3" />
        {approveLabel}
      </Button>
      <Button
        type="button"
        size={size}
        variant={status === "rejected" ? "default" : "outline"}
        onClick={onReject}
        disabled={disabled}
        className={size === "sm" ? "h-7 px-2 text-xs" : undefined}
      >
        <X className="mr-1 h-3 w-3" />
        {rejectLabel}
      </Button>
    </div>
  );
}
