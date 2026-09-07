import { apiClient } from "@/lib/api";

// Keep these defaults in step with the repository-root RELEASE.json, which is
// the single source of truth the backend reads for /system/version/. A stale
// default here is not harmless: `releasesMatch` drives the blocking
// "UI and backend do not match" banner in ProtectedLayout.
export const UI_RELEASE_ID =
  process.env.NEXT_PUBLIC_RELEASE_ID || "EFOP-38.7.0-V17.7";
export const UI_SOURCE_REVISION =
  process.env.NEXT_PUBLIC_SOURCE_REVISION || "unknown";

export interface ReleaseMetadata {
  release_id: string;
  source_revision: string;
  built_at: string;
  schema_revision: string;
  environment: string;
}

interface ReleaseResponse {
  success: boolean;
  message: string;
  data: ReleaseMetadata;
}

export async function loadBackendRelease(): Promise<ReleaseMetadata> {
  const response = await apiClient.get<ReleaseResponse>("/system/version/");
  return response.data;
}

export function releasesMatch(
  apiReleaseId: string | null | undefined,
): boolean {
  return Boolean(apiReleaseId) && apiReleaseId === UI_RELEASE_ID;
}
