import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useArtist } from "@/lib/queries/artists";
import { LookComposer } from "@/components/looks/LookComposer";

// ---------------------------------------------------------------------------
// /artists/$id/looks/new — three-panel composer
// Search param: ?parentLookId=<uuid> for iterations / variants
// ---------------------------------------------------------------------------
export default function LookComposerPage({
  artistId,
  parentLookId,
}: {
  artistId: string;
  parentLookId?: string | null;
}) {
  const artistQuery = useArtist(artistId);
  const title = artistQuery.data
    ? `Compose look — ${artistQuery.data.name}`
    : "Compose look";
  return (
    <>
      <PageHeader
        title={title}
        subtitle={
          parentLookId
            ? "Iterating on an existing look — tweak prompts or swap items, then regenerate."
            : "Pick references, write a prompt, generate an identity-locked outfit."
        }
      />
      <div className="space-y-4 px-6 py-4">
        <div className="flex items-center justify-between">
          <Button asChild variant="outline" size="sm">
            <Link
              to="/artists/$id/looks"
              params={{ id: artistId }}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              All looks
            </Link>
          </Button>
        </div>
        <LookComposer artistId={artistId} parentLookId={parentLookId ?? null} />
      </div>
    </>
  );
}
