import { companyMetadata, PublicCompanyRoute } from "../public-company-route";

export function generateMetadata() {
  return companyMetadata("el-rhrib-cash");
}

export default function Page() {
  return <PublicCompanyRoute slug="el-rhrib-cash" />;
}
