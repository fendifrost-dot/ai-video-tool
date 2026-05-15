import { Link } from "@tanstack/react-router";
import { Plus, Users as UsersIcon } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ArtistCard } from "@/components/artists/ArtistCard";
import { useArtists } from "@/lib/queries/artists";

export default function Artists() {
  const { data: artists, isLoading, error } = useArtists();

  return (
    <>
      <PageHeader
        title="Artists"
        subtitle="Reusable identity profiles. Each artist's continuity rules are auto-merged into every prompt."
      />

      <div className="px-8 py-6">
        <div className="mb-6 flex items-center justify-end">
          <Button asChild>
            <Link to="/artists/new">
              <Plus className="mr-1.5 h-4 w-4" />
              New artist
            </Link>
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load artists: {error instanceof Error ? error.message : String(error)}
          </div>
        )}

        {isLoading ? (
          <LoadingGrid />
        ) : artists && artists.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {artists.map((a) => (
              <ArtistCard key={a.id} artist={a} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-lg border border-border bg-muted/20" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-border p-12 text-center">
      <UsersIcon className="mx-auto h-8 w-8 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-medium">No artists yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Create one to start building reusable identity profiles.
      </p>
      <div className="mt-6">
        <Button asChild>
          <Link to="/artists/new">
            <Plus className="mr-1.5 h-4 w-4" />
            Create your first artist
          </Link>
        </Button>
      </div>
    </div>
  );
}
