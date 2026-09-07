import type { Metadata } from "next";
import { PublicInfoPage } from "@/components/public-info-page";
import { SourceText } from "@/components/i18n/SourceText";

export const metadata: Metadata = { title: "3RB Extreme support" };

export default function Page() {
  return (
    <PublicInfoPage
      titleSource="3RB Extreme support"
      descriptionSource="When reporting a problem, include the operation name, page, record reference, time, and the exact displayed error. Never include passwords, tokens, database credentials, or private attachments."
    >
      <p>
        <SourceText
          source="Administrators can use the Audit Log and the event reference shown by unexpected errors to investigate."
          leading
          trailing
        />
      </p>
    </PublicInfoPage>
  );
}
