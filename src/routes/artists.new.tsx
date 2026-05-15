import { createFileRoute } from "@tanstack/react-router";
import ArtistNew from "@/pages/ArtistNew";
export const Route = createFileRoute("/artists/new")({ component: ArtistNew });
