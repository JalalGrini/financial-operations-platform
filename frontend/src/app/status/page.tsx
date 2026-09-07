import { PublicInfoPage } from "@/components/public-info-page";
export default function Page() {
  return (
    <PublicInfoPage
      titleSource="System status"
      descriptionSource="Use the authenticated application and backend health endpoints to confirm current service availability. A static page cannot guarantee live PostgreSQL or Redis status."
    >
      <p>
        <SourceText
          source="If sign-in works but an operation fails, preserve the displayed error and event reference for the Administrator."
          leading
          trailing
        />
      </p>
    </PublicInfoPage>
  );
}
import { SourceText } from "@/components/i18n/SourceText";
