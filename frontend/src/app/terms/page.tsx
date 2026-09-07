import { PublicInfoPage } from "@/components/public-info-page";
export default function Page() {
  return (
    <PublicInfoPage
      titleSource="Terms of use"
      descriptionSource="EFOP is an internal organizational system. Use it only for authorized business operations and maintain accurate company ownership, dates, amounts, and supporting references."
    >
      <p>
        <SourceText
          source="Archive incorrect or obsolete records rather than attempting to hide history."
          leading
          trailing
        />
      </p>
    </PublicInfoPage>
  );
}
import { SourceText } from "@/components/i18n/SourceText";
