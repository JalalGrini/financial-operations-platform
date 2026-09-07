import type { PublicCompanyKey } from "./public-companies";

export type PublicCompanyCardSlug = "3rb-extreme" | "3rb-maroc" | "el-rhrib-cash";

export type PublicCompanyCard = {
  slug: PublicCompanyCardSlug;
  apiKey: PublicCompanyKey;
  name: string;
  role: string;
  body: string;
};

/**
 * Landing / public-company card copy. English `source` keys already map to the
 * exact 3rbextreme.ma French in the i18n catalogue.
 */
export const PUBLIC_COMPANY_CARDS: readonly PublicCompanyCard[] = [
  {
    slug: "3rb-extreme",
    apiKey: "3rb_extreme",
    name: "3.R.B Extreme",
    role: "Cleaning, disinfection, technical staffing and events",
    body: "Professional cleaning for businesses and individuals, certified disinfection, technical maintenance, and the organisation of private or professional events.",
  },
  {
    slug: "3rb-maroc",
    apiKey: "3rb_maroc",
    name: "3.R.B Maroc",
    role: "Guarding and security",
    body: "3.R.B Maroc specialises in guarding and provides security for companies and individuals: businesses, residences and special events. Trained agents handle surveillance, patrols, access control and event security.",
  },
  {
    slug: "el-rhrib-cash",
    apiKey: "el_rhrib_cash",
    name: "EL RHRIB CASH",
    role: "Courier and money transfer",
    body: "Courier handling for any article type and money transfer, tracked end to end through the TAWSSIL system.",
  },
];

export const GROUP_INTRO_SOURCE =
  "Founded in 2014, Groupe 3.R.B brings three service companies under a single standard: satisfying our clients through the quality of our services, and assuring them through devotion to our craft.";

export function publicCompanyHref(slug: string): string {
  return `/${slug}`;
}

export function getPublicCompanyCard(slug: string): PublicCompanyCard | undefined {
  return PUBLIC_COMPANY_CARDS.find((card) => card.slug === slug);
}
