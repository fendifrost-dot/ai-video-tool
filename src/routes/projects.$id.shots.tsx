import { createFileRoute } from "@tanstack/react-router";
import { Shots } from "@/pages/ProjectSections";
export const Route = createFileRoute("/projects/$id/shots")({ component: Shots });
