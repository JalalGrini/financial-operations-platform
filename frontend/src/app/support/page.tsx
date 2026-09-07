import { PublicInfoPage } from "@/components/public-info-page";
export default function Page() {
  return (
    <PublicInfoPage
      titleSource="EFOP support"
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
import { SourceText } from "@/components/i18n/SourceText";
