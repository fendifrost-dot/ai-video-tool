import { createFileRoute } from "@tanstack/react-router";
import { Review } from "@/pages/ProjectSections";
export const Route = createFileRoute("/projects/$id/review")({ component: Review });
