import { Link, useRouterState } from "@tanstack/react-router";
import { FileText, Clapperboard, Image as ImageIcon, Eye, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { slug: "treatment", label: "Treatment", icon: FileText },
  { slug: "shots", label: "Shots", icon: Clapperboard },
  { slug: "assets", label: "Assets", icon: ImageIcon },
  { slug: "review", label: "Review", icon: Eye },
  { slug: "export", label: "Export", icon: Upload },
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
          const to = `/projects/${projectId}/${item.slug}`;
          const active = pathname.startsWith(to);
          const Icon = item.icon;
          return (
            <Link
              key={item.slug}
              to="/projects/$id/$section"
              params={{ id: projectId, section: item.slug }}
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
