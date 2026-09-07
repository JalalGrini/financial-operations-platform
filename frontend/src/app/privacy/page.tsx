import { PublicInfoPage } from "@/components/public-info-page";
export default function Page() {
  return (
    <PublicInfoPage
      titleSource="Privacy"
      descriptionSource="EFOP stores organization-approved operational, financial, personnel, inventory, and audit data. Access is role-controlled and important actions are traceable."
    >
      <p>
        <SourceText
          source="Do not enter secrets in free-text fields. Follow your organization’s retention and privacy policy."
          leading
          trailing
        />
      </p>
    </PublicInfoPage>
  );
}
import { SourceText } from "@/components/i18n/SourceText";
