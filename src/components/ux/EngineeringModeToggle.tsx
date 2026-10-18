import { FlaskConical } from "lucide-react";

import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEngineeringMode } from "@/lib/ux/engineeringMode";

const CONTROL_ID = "avt-engineering-mode-toggle";

const HELP =
  "Show specialist tools (hero frame, prompt lab, scorecards). Off by default — the main workflow stays clear.";

/**
 * Toggle between the default creative experience and the full engineering
 * surface. Reads/writes the shared {@link useEngineeringMode} store, so the
 * sidebar (and any other consumer) reacts instantly.
 *
 * `collapsed` renders an icon-only affordance for the narrow rail; expanded
 * shows a labelled switch.
 */
export function EngineeringModeToggle({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const { isEngineering, toggleMode } = useEngineeringMode();

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              role="switch"
              aria-checked={isEngineering}
              aria-label="Specialist tools"
              onClick={() => toggleMode()}
              className={cn(
                "flex w-full items-center justify-center rounded-xl px-2 py-2.5 transition-all",
                isEngineering
                  ? "glass-raised text-primary"
                  : "text-foreground/50 hover:bg-white/5 hover:text-foreground",
                className,
              )}
            >
              <FlaskConical className="h-4 w-4 shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {isEngineering ? "Specialist tools: on" : "Specialist tools: off"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
        className,
      )}
    >
      <FlaskConical
        className={cn(
          "h-4 w-4 shrink-0",
          isEngineering ? "text-primary" : "text-foreground/50",
        )}
      />
      <label
        htmlFor={CONTROL_ID}
        className="min-w-0 flex-1 cursor-pointer font-medium text-foreground/80"
        title={HELP}
      >
        Specialist tools
      </label>
      <Switch
        id={CONTROL_ID}
        checked={isEngineering}
        onCheckedChange={() => toggleMode()}
        aria-label="Specialist tools"
      />
    </div>
  );
}
