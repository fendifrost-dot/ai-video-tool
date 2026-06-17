import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ArtistIdentityForm } from "@/components/artists/ArtistIdentityForm";
import { Reference360Uploader } from "@/components/artists/Reference360Uploader";
import { ArtistAssetGrid } from "@/components/artists/ArtistAssetGrid";
import { CharacterDNATabs } from "@/components/artists/CharacterDNATabs";
import { StyleReferencesTab } from "@/components/styleReferences/StyleReferencesTab";
import { WardrobeTab } from "@/components/wardrobe/WardrobeTab";
import { useArtist, useDeleteArtist } from "@/lib/queries/artists";

export default function ArtistDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const { data: artist, isLoading, error } = useArtist(id);
  const del = useDeleteArtist();

  if (isLoading) {
    return (
      <>
        <PageHeader title="Artist" />
        <div className="px-8 py-6">
          <div className="h-24 animate-pulse rounded-md border border-border bg-muted/20" />
        </div>
      </>
    );
  }

  if (error || !artist) {
    return (
      <>
        <PageHeader title="Artist" />
        <div className="px-8 py-6">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Artist not found."}
          </div>
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link to="/artists">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to artists
              </Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  async function handleDelete() {
    if (!confirm(`Delete "${artist!.name}"? This also removes their reference assets.`)) {
      return;
    }
    try {
      await del.mutateAsync(artist!.id);
      toast.success("Artist deleted");
      navigate({ to: "/artists" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <>
      <PageHeader title={artist.name} subtitle={artist.bio ?? undefined} />
      <div className="space-y-10 px-8 py-6">
        <div className="flex items-center justify-between">
          <Button asChild variant="outline" size="sm">
            <Link to="/artists">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              All artists
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            {/* Primary action: cross-link to this artist's looks library.
                Previously this lived next to Delete which was easy to mistap. */}
            <Button asChild>
              <Link
                to="/artists/$id/looks"
                params={{ id: artist.id }}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                View virtual samples
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              disabled={del.isPending}
              aria-label="Delete artist"
              title="Delete artist"
              className="text-muted-foreground hover:text-destructive ml-1"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ArtistIdentityForm artist={artist} />

        <CharacterDNATabs artistId={artist.id} />

        <StyleReferencesTab artist={artist} />

        <WardrobeTab artistId={artist.id} />

        <div className="rounded-md border border-border">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
              <span>Legacy reference library</span>
              <span className="text-[10px] normal-case opacity-60">
                Superseded by Character DNA — kept for migration
              </span>
            </summary>
            <div className="space-y-8 border-t border-border p-4">
              <Reference360Uploader artistId={artist.id} />
              <ArtistAssetGrid artistId={artist.id} />
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
