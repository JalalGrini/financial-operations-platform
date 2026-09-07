import { PublicInfoPage } from "@/components/public-info-page";
export default function Page() {
  return (
    <PublicInfoPage
      titleSource="Request an EFOP account"
      descriptionSource="Public self-registration is disabled because EFOP contains multi-company financial and personnel data. An Administrator must create your account and assign the correct Assistant, Director, or Administrator role."
    >
      <p>
        <SourceText
          source="Contact your parent-company Administrator and include your work email and required role."
          leading
          trailing
        />
      </p>
    </PublicInfoPage>
  );
}
import { SourceText } from "@/components/i18n/SourceText";
