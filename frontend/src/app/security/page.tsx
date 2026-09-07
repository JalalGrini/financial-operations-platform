import { PublicInfoPage } from "@/components/public-info-page";
export default function Page() {
  return (
    <PublicInfoPage
      titleSource="Security"
      descriptionSource="EFOP uses HttpOnly cookie authentication, CSRF protection, role authorization, reversible archive workflows, and confirmation-gated permanent deletion."
    >
      <p>
        <SourceText
          source="Sign out on shared computers and report unexpected access immediately."
          leading
          trailing
        />
      </p>
    </PublicInfoPage>
  );
}
import { SourceText } from "@/components/i18n/SourceText";
