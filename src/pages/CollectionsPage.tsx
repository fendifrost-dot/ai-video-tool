import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Layers, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCollections, useCreateCollection } from "@/lib/queries/collections";

export default function CollectionsPage() {
  const query = useCollections();
  const create = useCreateCollection();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [season, setSeason] = useState("");

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Collection name is required");
      return;
    }
    try {
      const row = await create.mutateAsync({
        name: name.trim(),
        season: season.trim() || null,
      });
      setName("");
      setSeason("");
      navigate({ to: "/collections/$id", params: { id: row.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <>
      <PageHeader
        title="Collections"
        subtitle="Seasonal drops and campaign groupings — FW26, Runway Music, and more."
      />
      <div className="space-y-6 px-4 py-6 md:px-8">
        <div className="flex flex-wrap gap-2 rounded-md border border-border bg-card/30 p-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Collection name"
            className="max-w-xs"
          />
          <Input
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            placeholder="Season (optional)"
            className="max-w-[140px]"
          />
          <Button type="button" size="sm" disabled={create.isPending} onClick={handleCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            New collection
          </Button>
        </div>

        {(query.data ?? []).length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-12 text-center">
            <Layers className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">No collections yet.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(query.data ?? []).map((c) => (
              <Link
                key={c.id}
                to="/collections/$id"
                params={{ id: c.id }}
                className="rounded-md border border-border bg-card p-4 transition hover:border-foreground/30"
              >
                <p className="font-semibold">{c.name}</p>
                {c.season && (
                  <p className="mt-1 text-xs text-muted-foreground">{c.season}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
