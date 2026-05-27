import { Link, useRouterState } from "@tanstack/react-router";
import {
  FileText,
  Clapperboard,
  Image as ImageIcon,
  Eye,
  Lock,
  Upload,
  Wand2,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/projects/$id/treatment", label: "Treatment", icon: FileText, key: "treatment" },
  { to: "/projects/$id/shots", label: "Shots", icon: Clapperboard, key: "shots" },
  { to: "/projects/$id/prompt", label: "Prompt", icon: Wand2, key: "prompt" },
  { to: "/projects/$id/video", label: "Video", icon: Video, key: "video" },
  { to: "/projects/$id/assets", label: "Assets", icon: ImageIcon, key: "assets" },
  { to: "/projects/$id/review", label: "Review", icon: Eye, key: "review" },
  { to: "/projects/$id/continuity", label: "Continuity", icon: Lock, key: "continuity" },
  { to: "/projects/$id/export", label: "Export", icon: Upload, key: "export" },
] as const;

export function ProjectSidebar({ projectId }: { projectId: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      {/* Desktop: floating glass column */}
      <aside className="relative z-10 hidden md:block md:w-60 md:shrink-0 md:p-4 md:pr-0">
        <div className="glass-float sticky top-4 rounded-2xl p-3">
          <div className="px-3 pt-2 pb-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-foreground/50">
              Project
            </p>
            <p className="mt-1 truncate font-display text-sm font-semibold text-foreground">
              {projectId.slice(0, 8)}…
            </p>
          </div>
          <nav className="space-y-1">
            {items.map((item) => {
              const active = pathname.startsWith(`/projects/${projectId}/${item.key}`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  params={{ id: projectId }}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    active
                      ? "glass-raised text-foreground"
                      : "text-foreground/60 hover:bg-white/5 hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-transform group-hover:scale-110",
                      active && "text-primary",
                    )}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>
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
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
