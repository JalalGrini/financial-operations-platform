export function extractFieldErrors(error: unknown): Record<string, string> {
  const data = (error as any)?.response?.data;
  const raw = data?.errors ?? data;
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key === "success" || key === "message" || key === "detail") continue;
    if (Array.isArray(value)) out[key] = value.map(String).join(" ");
    else if (typeof value === "string") out[key] = value;
  }
  return out;
}
export function operationError(operation: string, error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return `${operation} failed: ${message}`;
}
