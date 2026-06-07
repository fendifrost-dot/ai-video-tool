import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Clapperboard,
  Film,
  Image as ImageIcon,
  Eye,
  Lock,
  Upload,
  Wand2,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProject } from "@/lib/queries/projects";
import { useProjectRail } from "@/lib/projectRail";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

const items = [
  { to: "/projects/$id/shots", label: "Shots", icon: Clapperboard, key: "shots" },
  { to: "/projects/$id/assets", label: "Assets", icon: ImageIcon, key: "assets" },
  { to: "/projects/$id/prompt", label: "Prompt Lab", icon: Wand2, key: "prompt" },
  { to: "/projects/$id/video", label: "Video", icon: Video, key: "video" },
  { to: "/projects/$id/review", label: "Review", icon: Eye, key: "review" },
  { to: "/projects/$id/timeline", label: "Music Video Editor", icon: Film, key: "timeline" },
  { to: "/projects/$id/continuity", label: "Continuity", icon: Lock, key: "continuity" },
  { to: "/projects/$id/export", label: "Export", icon: Upload, key: "export" },
  { to: "/projects/$id/treatment", label: "Treatment", icon: FileText, key: "treatment", soon: true },
] as const;

export function ProjectSidebar({ projectId }: { projectId: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const projectQuery = useProject(projectId);
  const { collapsed, setCollapsed } = useProjectRail();
  const projectTitle =
    projectQuery.data?.title?.trim() ||
    (projectQuery.isLoading ? "Loading…" : `${projectId.slice(0, 8)}…`);

  return (
    <>
      {/* Desktop: floating glass column */}
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
              {items.map((item) => {
                const active = pathname.startsWith(`/projects/${projectId}/${item.key}`);
                const Icon = item.icon;
                const link = (
                  <Link
                    key={item.key}
                    to={item.to}
                    params={{ id: projectId }}
                    className={cn(
                      "group flex items-center rounded-xl text-sm font-medium transition-all",
                      collapsed
                        ? "justify-center px-2 py-2.5"
                        : "gap-3 px-3 py-2.5",
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
                        {"soon" in item && item.soon && (
                          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                            Soon
                          </span>
                        )}
                      </span>
                    )}
                  </Link>
                );

                if (!collapsed) return link;

                return (
                  <Tooltip key={item.key}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">
                      {item.label}
                      {"soon" in item && item.soon ? " (soon)" : ""}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </nav>
          </TooltipProvider>
        </div>
      </aside>

      {/* Mobile: horizontal scroll chip nav */}
      <nav className="md:hidden sticky top-20 z-20 -mx-1 px-4">
        <div className="glass rounded-2xl p-1.5">
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {items.map((item) => {
              const active = pathname.startsWith(`/projects/${projectId}/${item.key}`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  params={{ id: projectId }}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all",
                    active
                      ? "glass-raised text-foreground"
                      : "text-foreground/60",
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5", active && "text-primary")} />
                  {item.label}
                  {"soon" in item && item.soon && (
                    <span className="rounded-full bg-muted px-1 py-0.5 text-[8px] uppercase">Soon</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
