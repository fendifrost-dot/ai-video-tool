import { createFileRoute } from "@tanstack/react-router";
import Artists from "@/pages/Artists";
export const Route = createFileRoute("/artists/")({ component: Artists });
