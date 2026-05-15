import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateArtist } from "@/lib/queries/artists";

export default function ArtistNew() {
  const navigate = useNavigate();
  const create = useCreateArtist();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const artist = await create.mutateAsync({
        name: name.trim(),
        bio: bio.trim() || null,
      });
      toast.success("Artist created");
      navigate({ to: "/artists/$id", params: { id: artist.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <>
      <PageHeader
        title="New artist"
        subtitle="Just give them a name to start — you can fill in the identity profile next."
      />
      <form onSubmit={handleSubmit} className="max-w-xl space-y-6 px-8 py-6">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Artist name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio">Bio (optional)</Label>
          <Textarea
            id="bio"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Short bio, optional"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate({ to: "/artists" })}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creating..." : "Create artist"}
          </Button>
        </div>
      </form>
    </>
  );
}
