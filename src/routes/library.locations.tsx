import { createFileRoute } from "@tanstack/react-router";
import LocationsLibraryPage from "@/pages/LocationsLibraryPage";

export const Route = createFileRoute("/library/locations")({
  component: LocationsLibraryPage,
});
