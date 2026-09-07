import { companyPageMetadata, MarketingCompanyPage } from "../public-company-page";

export function generateMetadata() {
  return companyPageMetadata("el-rhrib-cash");
}

export default function Page() {
  return <MarketingCompanyPage slug="el-rhrib-cash" />;
}
