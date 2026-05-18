import { Link } from "@tanstack/react-router";
import type { Artist } from "@/integrations/supabase/aliases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User } from "lucide-react";

export function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <Link
      to="/artists/$id"
      params={{ id: artist.id }}
      className="block transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
    >
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          <CardTitle className="text-base font-medium">{artist.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          {artist.bio ? (
            <p className="line-clamp-2">{artist.bio}</p>
          ) : (
            <p className="italic">No bio yet.</p>
          )}
          <p className="text-xs">Updated {formatRelative(artist.updated_at)}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
