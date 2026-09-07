import type { Metadata } from "next";
import { PublicInfoPage } from "@/components/public-info-page";
import { SourceText } from "@/components/i18n/SourceText";

export const metadata: Metadata = { title: "Request a 3RB Extreme account" };

export default function Page() {
  return (
    <PublicInfoPage
      titleSource="Request a 3RB Extreme account"
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
