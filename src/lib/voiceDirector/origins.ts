const DEFAULT_ORIGINS = [
  "https://aivideotool.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
];

export function isAllowedDirectorOrigin(
  origin: string | null | undefined,
  extra: string[] = [],
): boolean {
  if (!origin) return false;
  const allowed = new Set([...DEFAULT_ORIGINS, ...extra]);
  return allowed.has(origin);
}
