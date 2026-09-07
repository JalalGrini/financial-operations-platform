import { PublicInfoPage } from "@/components/public-info-page";
export default function Page() {
  return (
    <PublicInfoPage
      titleSource="Password assistance"
      descriptionSource="For security, EFOP accounts are managed by your organization’s Administrator. Ask an Administrator to reset your password. Passwords and reset links must never be shared in chat or email."
    >
      <p>
        <SourceText
          source="If you are an Administrator with server access, use Django’s interactive changepassword command for the affected email."
          leading
          trailing
        />
      </p>
    </PublicInfoPage>
  );
}
import { SourceText } from "@/components/i18n/SourceText";
