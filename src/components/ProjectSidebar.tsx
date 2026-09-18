import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  Clapperboard,
  Film,
  Image as ImageIcon,
  Eye,
  Lock,
  Upload,
  Wand2,
  Video,
  Shirt,
  Navigation,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProject } from "@/lib/queries/projects";
import { useProjectRail } from "@/lib/projectRail";
import { useEngineeringMode } from "@/lib/ux/engineeringMode";
import { EngineeringModeToggle } from "@/components/ux/EngineeringModeToggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

type NavItem = {
  to: string;
  label: string;
  icon: typeof FileText;
  key: string;
};

/** Primary creative funnel — always visible. */
const primaryItems: readonly NavItem[] = [
  { to: "/projects/$id/treatment", label: "Treatment", icon: FileText, key: "treatment" },
  { to: "/projects/$id/assets", label: "Assets", icon: ImageIcon, key: "assets" },
  { to: "/projects/$id/video", label: "Produce Video", icon: Video, key: "video" },
  { to: "/projects/$id/review", label: "Review", icon: Eye, key: "review" },
  { to: "/projects/$id/export", label: "Export", icon: Upload, key: "export" },
] as const;

/** Engineering destinations — revealed in engineering mode (Lane G store). */
const advancedItems: readonly NavItem[] = [
  { to: "/projects/$id/shots", label: "Shot List", icon: Clapperboard, key: "shots" },
  {
    to: "/projects/$id/cover-flight",
    label: "Cover Flight",
    icon: Navigation,
    key: "cover-flight",
  },
  { to: "/projects/$id/hero-frame", label: "Hero Frame", icon: Shirt, key: "hero-frame" },
  { to: "/projects/$id/prompt", label: "Prompt Lab", icon: Wand2, key: "prompt" },
  { to: "/projects/$id/timeline", label: "Music Video Editor", icon: Film, key: "timeline" },
  { to: "/projects/$id/continuity", label: "Continuity", icon: Lock, key: "continuity" },
] as const;

export function ProjectSidebar({ projectId }: { projectId: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const projectQuery = useProject(projectId);
  const { collapsed, setCollapsed } = useProjectRail();
  const { isEngineering, setMode } = useEngineeringMode();
  const projectTitle =
    projectQuery.data?.title?.trim() ||
    (projectQuery.isLoading ? "Loading…" : `${projectId.slice(0, 8)}…`);

  const isActive = (item: NavItem) => pathname.startsWith(`/projects/${projectId}/${item.key}`);

  // Deep-link safety: reveal Advanced when on an advanced route even if mode is creative.
  const onAdvancedRoute = advancedItems.some(isActive);
  const showAdvanced = isEngineering || onAdvancedRoute;

  const renderLink = (item: NavItem, layout: "rail" | "chip") => {
    const active = isActive(item);
    const Icon = item.icon;
    if (layout === "chip") {
      return (
        <Link
          key={item.key}
          to={item.to}
          params={{ id: projectId }}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all",
            active ? "glass-raised text-foreground" : "text-foreground/60",
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", active && "text-primary")} />
          {item.label}
        </Link>
      );
    }

    const link = (
      <Link
        key={item.key}
        to={item.to}
        params={{ id: projectId }}
        className={cn(
          "group flex items-center rounded-xl text-sm font-medium transition-all",
          collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
          active
            ? "glass-raised text-foreground"
            : "text-foreground/60 hover:bg-white/5 hover:text-foreground",
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-transform group-hover:scale-110",
            active && "text-primary",
          )}
        />
        {!collapsed && (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate">{item.label}</span>
          </span>
        )}
      </Link>
    );

    if (!collapsed) return link;

    return (
      <Tooltip key={item.key}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <>
      <aside
        className={cn(
          "relative z-10 hidden shrink-0 transition-[width] duration-200 md:block md:p-4 md:pr-0",
          collapsed ? "md:w-[4.5rem]" : "md:w-60",
        )}
      >
        <div className="glass-float sticky top-4 rounded-2xl p-3">
          <div
            className={cn(
              "flex items-start gap-1 pb-3",
              collapsed ? "flex-col items-center px-0 pt-1" : "px-3 pt-2",
            )}
          >
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.2em] text-foreground/50">
                  Project
                </p>
                <p
                  className="mt-1 truncate font-display text-sm font-semibold text-foreground"
                  title={projectTitle}
                >
                  {projectTitle}
                </p>
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn("h-7 w-7 shrink-0 p-0", collapsed && "mt-1")}
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expand project rail" : "Collapse project rail"}
              title={collapsed ? "Expand rail" : "Collapse rail"}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>
          <TooltipProvider delayDuration={0}>
            <nav className="space-y-1">
              {primaryItems.map((item) => renderLink(item, "rail"))}

              <div className={cn("pt-2", !collapsed && "px-1")}>
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 w-full justify-center p-0 text-foreground/60 hover:text-foreground"
                        onClick={() =>
                          setMode(isEngineering ? "creative" : "engineering")
                        }
                        aria-expanded={showAdvanced}
                        aria-label={isEngineering ? "Hide Advanced" : "Show Advanced"}
                      >
                        <SlidersHorizontal
                          className={cn("h-4 w-4", showAdvanced && "text-primary")}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {isEngineering ? "Hide Advanced" : "Show Advanced"}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMode(isEngineering ? "creative" : "engineering")}
                    aria-expanded={showAdvanced}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/45 transition-colors hover:text-foreground/70"
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    <span className="flex-1 text-left">Advanced</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        showAdvanced && "rotate-180",
                      )}
                    />
                  </button>
                )}
              </div>

              {showAdvanced && advancedItems.map((item) => renderLink(item, "rail"))}
            </nav>
            <div className="mt-2 border-t border-white/5 pt-2">
              <EngineeringModeToggle collapsed={collapsed} />
            </div>
          </TooltipProvider>
        </div>
      </aside>

      <nav className="md:hidden relative z-20 px-4">
        <div className="glass rounded-2xl p-1.5">
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {primaryItems.map((item) => renderLink(item, "chip"))}
            <button
              type="button"
              onClick={() => setMode(isEngineering ? "creative" : "engineering")}
              aria-expanded={showAdvanced}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all",
                showAdvanced ? "text-foreground" : "text-foreground/60",
              )}
            >
              <SlidersHorizontal className={cn("h-3.5 w-3.5", showAdvanced && "text-primary")} />
              Advanced
              <ChevronDown
                className={cn("h-3 w-3 transition-transform", showAdvanced && "rotate-180")}
              />
            </button>
            {showAdvanced && advancedItems.map((item) => renderLink(item, "chip"))}
            <div className="ml-auto shrink-0 pl-1">
              <EngineeringModeToggle collapsed />
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
