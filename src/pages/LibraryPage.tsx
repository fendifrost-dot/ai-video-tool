import { Link } from "@tanstack/react-router";
import { MapPin, Package } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { cn } from "@/lib/utils";
import LocationsLibraryPage from "@/pages/LocationsLibraryPage";
import PropsLibraryPage from "@/pages/PropsLibraryPage";

export type LibraryKind = "locations" | "props";

export default function LibraryPage({ kind }: { kind: LibraryKind }) {
  return (
    <>
      <PageHeader
        title="Library"
        subtitle="Reusable locations and props — pin to a project when you're ready to use them."
      />
      <div className="border-b border-border px-4 md:px-8">
        <nav className="-mb-px flex gap-1">
          <LibraryTab to="/library/locations" active={kind === "locations"} icon={MapPin}>
            Locations
          </LibraryTab>
          <LibraryTab to="/library/props" active={kind === "props"} icon={Package}>
            Props
          </LibraryTab>
        </nav>
      </div>
      {kind === "locations" ? (
        <LocationsLibraryPage embedded />
      ) : (
        <PropsLibraryPage embedded />
      )}
    </>
  );
}

function LibraryTab({
  to,
  active,
  icon: Icon,
  children,
}: {
  to: "/library/locations" | "/library/props";
  active: boolean;
  icon: typeof MapPin;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  );
}
