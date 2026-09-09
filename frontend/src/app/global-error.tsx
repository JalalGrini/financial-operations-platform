"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { sourceText } from "@/lib/i18n/source-catalog";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <h1>{sourceText("Something went wrong")}</h1>
      </body>
    </html>
  );
}
