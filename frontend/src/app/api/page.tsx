import type { Metadata } from "next";
import { PublicInfoPage } from "@/components/public-info-page";
import { SourceText } from "@/components/i18n/SourceText";

export const metadata: Metadata = { title: "3RB Extreme API" };

export default function Page() {
  return (
    <PublicInfoPage
      titleSource="3RB Extreme API"
      descriptionSource="The EFOP API is an authenticated internal interface. Interactive OpenAPI documentation is served by the backend at /api/docs/ in local and authorized environments."
    >
      <p>
        <SourceText
          source="API access follows the same role, CSRF, lifecycle, and audit rules as the browser application."
          leading
          trailing
        />
      </p>
    </PublicInfoPage>
  );
}
