import { Link, useRouterState } from "@tanstack/react-router";
import {
  FileText,
  Clapperboard,
  Image as ImageIcon,
  Eye,
  Upload,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/projects/$id/treatment", label: "Treatment", icon: FileText, key: "treatment" },
  { to: "/projects/$id/shots", label: "Shots", icon: Clapperboard, key: "shots" },
  { to: "/projects/$id/prompt", label: "Prompt", icon: Wand2, key: "prompt" },
  { to: "/projects/$id/assets", label: "Assets", icon: ImageIcon, key: "assets" },
  { to: "/projects/$id/review", label: "Review", icon: Eye, key: "review" },
  { to: "/projects/$id/export", label: "Export", icon: Upload, key: "export" },
] as const;

export function ProjectSidebar({ projectId }: { projectId: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card/30">
      <div className="px-4 py-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Project</p>
        <p className="mt-1 truncate text-sm font-medium">{projectId}</p>
      </div>
      <nav className="space-y-0.5 px-2 pb-4">
        {items.map((item) => {
          const active = pathname.startsWith(`/projects/${projectId}/${item.key}`);
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              to={item.to}
              params={{ id: projectId }}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
