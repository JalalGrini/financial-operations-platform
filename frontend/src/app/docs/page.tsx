import type { Metadata } from "next";
import { PublicInfoPage } from "@/components/public-info-page";
import { SourceText } from "@/components/i18n/SourceText";

export const metadata: Metadata = { title: "3RB Extreme user guide" };

export default function Page() {
  return (
    <PublicInfoPage
      titleSource="3RB Extreme user guide"
      descriptionSource="EFOP is organized around all-company views. Select a company only when you need to narrow the list. Archive preserves records and Restore returns them; permanent deletion is Administrator-only."
    >
      <p>
        <SourceText
          source="Use the in-page labels and validation messages. Required fields are marked; additional accounting and inventory details are optional."
          leading
          trailing
        />
      </p>
    </PublicInfoPage>
  );
}
