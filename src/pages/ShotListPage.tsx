import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Clapperboard, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShotStatusPill } from "@/components/shots/ShotStatusPill";
import { useProject } from "@/lib/queries/projects";
import {
  useCreateShot,
  useDeleteShot,
  useProjectShots,
} from "@/lib/queries/shots";
import type { ShotStatus } from "@/integrations/supabase/types";

type FilterMode = "all" | ShotStatus;

export default function ShotListPage({ projectId }: { projectId: string }) {
  const projectQuery = useProject(projectId);
  const shotsQuery = useProjectShots(projectId);
  const createShot = useCreateShot();
  const deleteShot = useDeleteShot();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterMode>("all");

  const filtered = useMemo(
    () =>
      (shotsQuery.data ?? []).filter(
        (s) => filter === "all" || s.status === filter,
      ),
    [shotsQuery.data, filter],
  );

  async function handleAdd() {
    try {
      const shot = await createShot.mutateAsync({ project_id: projectId });
      navigate({
        to: "/projects/$id/shots/$shotId",
        params: { id: projectId, shotId: shot.id },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add shot");
    }
  }

  async function handleDelete(id: string, shotNumber: number) {
    if (!confirm(`Delete shot #${shotNumber}? This also removes its prompts and asset links.`)) return;
    try {
      await deleteShot.mutateAsync({ id, projectId });
      toast.success("Shot deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete");
    }
  }

  if (projectQuery.isLoading) {
    return (
      <>
        <PageHeader title="Shots" />
        <div className="px-8 py-6">
          <div className="h-24 animate-pulse rounded-md border border-border bg-muted/20" />
        </div>
      </>
    );
  }

  if (projectQuery.error || !projectQuery.data) {
    return (
      <>
        <PageHeader title="Shots" />
        <div className="px-8 py-6">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Project not found.
          </div>
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link to="/">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to dashboard
              </Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Shots"
        subtitle="The structured shot list. Each row links to a full editor with the prompt builder + asset gallery for that shot."
      />
      <div className="space-y-4 px-8 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-44">
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="generated">Generated</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="needs_regen">Needs regen</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">
            {filtered.length} of {(shotsQuery.data ?? []).length} {filtered.length === 1 ? "shot" : "shots"}
          </div>
          <div className="ml-auto">
            <Button onClick={handleAdd} disabled={createShot.isPending}>
              <Plus className="mr-1.5 h-4 w-4" />
              New shot
            </Button>
          </div>
        </div>

        {shotsQuery.isLoading ? (
          <div className="h-48 animate-pulse rounded-md border border-border bg-muted/20" />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-24">Section</TableHead>
                  <TableHead className="w-20">Type</TableHead>
                  <TableHead>Scene</TableHead>
                  <TableHead className="w-24">Tool</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() =>
                      navigate({
                        to: "/projects/$id/shots/$shotId",
                        params: { id: projectId, shotId: s.id },
                      })
                    }
                  >
                    <TableCell className="font-mono text-xs">{s.shot_number}</TableCell>
                    <TableCell className="font-mono text-xs">{s.song_section ?? "—"}</TableCell>
                    <TableCell className="text-xs">{s.shot_type ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {s.scene_description ? (
                        truncate(s.scene_description, 90)
                      ) : (
                        <span className="italic text-muted-foreground">no description</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{s.recommended_tool ?? "—"}</TableCell>
                    <TableCell>
                      <ShotStatusPill status={s.status} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(s.id, s.shot_number);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-border p-12 text-center">
      <Clapperboard className="mx-auto h-7 w-7 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-medium">No shots yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Build the shot list by adding shots one at a time. Each shot becomes its own prompt + asset target.
      </p>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
