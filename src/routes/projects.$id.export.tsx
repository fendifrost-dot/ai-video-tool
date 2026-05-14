import { createFileRoute } from "@tanstack/react-router";
import { ExportPage } from "@/pages/ProjectSections";
export const Route = createFileRoute("/projects/$id/export")({ component: ExportPage });
