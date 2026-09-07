"use client";

import { useEffect, useState } from "react";
import {
  loadBackendRelease,
  releasesMatch,
  UI_RELEASE_ID,
  type ReleaseMetadata,
} from "@/lib/release";

export function useReleaseIdentity() {
  const [backend, setBackend] = useState<ReleaseMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadBackendRelease()
      .then((value) => {
        if (!cancelled) setBackend(value);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to read API release",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    uiReleaseId: UI_RELEASE_ID,
    backend,
    error,
    isMismatch: backend ? !releasesMatch(backend.release_id) : false,
  };
}
