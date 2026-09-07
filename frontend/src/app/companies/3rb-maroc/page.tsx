import { companyMetadata, PublicCompanyRoute } from "../public-company-route";

export function generateMetadata() {
  return companyMetadata("3rb-maroc");
}

export default function Page() {
  return <PublicCompanyRoute slug="3rb-maroc" />;
}
