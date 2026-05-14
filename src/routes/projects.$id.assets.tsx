import { createFileRoute } from "@tanstack/react-router";
import { Assets } from "@/pages/ProjectSections";
export const Route = createFileRoute("/projects/$id/assets")({ component: Assets });
