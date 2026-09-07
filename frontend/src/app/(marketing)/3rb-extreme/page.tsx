import { companyPageMetadata, MarketingCompanyPage } from "../public-company-page";

export function generateMetadata() {
  return companyPageMetadata("3rb-extreme");
}

export default function Page() {
  return <MarketingCompanyPage slug="3rb-extreme" />;
}
