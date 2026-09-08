/**
 * Public group companies — names, copy and photos taken from
 * https://3rbextreme.ma/ and its company sub-pages.
 */

export type PublicCompanyKey = "3rb_extreme" | "3rb_maroc" | "el_rhrib_cash";

export type PublicCompany = {
  slug: string;
  apiKey: PublicCompanyKey;
  name: string;
  /** One-line activity shown in the navbar dropdown. */
  activity: string;
  tagline: string;
  description: string;
  services: readonly string[];
  heroImage: string;
  gallery: readonly { src: string; alt: string }[];
};

export const PUBLIC_COMPANIES: readonly PublicCompany[] = [
  {
    slug: "3rb-extreme",
    apiKey: "3rb_extreme",
    name: "3.R.B Extrême",
    activity: "Cleaning, disinfection, technical staffing and events",
    tagline:
      "3.R.B Extreme specialises in cleaning, disinfection, technical staffing and events",
    description:
      "3RB Extreme offers professional cleaning for businesses and individuals. Qualified teams clean offices, retail spaces, buildings, construction sites and more. We use environmentally responsible products and listen to specific client needs. For disinfection, we have the skills and equipment to remove bacteria, viruses and other pathogens. Technical personnel management covers equipment maintenance. We also organise private and professional events.",
    services: [
      "Professional cleaning",
      "Disinfection",
      "Technical personnel management",
      "Events",
      "Office cleaning",
      "Retail cleaning",
      "Building cleaning",
      "Construction site cleaning",
    ],
    heroImage: "/images/companies/3rb-extreme/hero.jpg",
    gallery: [
      {
        src: "/images/companies/3rb-extreme/gallery-01.jpg",
        alt: "Office cleaning",
      },
      {
        src: "/images/companies/3rb-extreme/gallery-02.png",
        alt: "Retail cleaning",
      },
      {
        src: "/images/companies/3rb-extreme/gallery-03.jpg",
        alt: "Building cleaning",
      },
      {
        src: "/images/companies/3rb-extreme/gallery-04.jpg",
        alt: "Construction site cleaning",
      },
      {
        src: "/images/companies/3rb-extreme/gallery-05.jpg",
        alt: "Vehicle washing",
      },
      {
        src: "/images/companies/3rb-extreme/gallery-06.jpg",
        alt: "Space cleaning",
      },
      {
        src: "/images/companies/3rb-extreme/gallery-07.jpg",
        alt: "3.R.B Extreme teams",
      },
    ],
  },
  {
    slug: "3rb-maroc",
    apiKey: "3rb_maroc",
    name: "3.R.B Maroc",
    activity: "Guarding and protection for companies, residences and events",
    tagline: "3.R.B Maroc specialises in guarding",
    description:
      "3.R.B Maroc specialises in guarding and provides security for companies and individuals: businesses, residences and special events. Trained agents handle surveillance, patrols, access control and event security.",
    services: [
      "Enterprise protection",
      "Residence protection",
      "Special event protection",
      "Surveillance and patrol",
      "Access control",
    ],
    heroImage: "/images/companies/3rb-maroc/hero.jpg",
    gallery: [
      {
        src: "/images/companies/3rb-maroc/gallery-01.jpg",
        alt: "Enterprise protection",
      },
      {
        src: "/images/companies/3rb-maroc/gallery-02.jpg",
        alt: "Residence protection",
      },
      {
        src: "/images/companies/3rb-maroc/gallery-03.jpg",
        alt: "Special event protection",
      },
      {
        src: "/images/companies/3rb-maroc/gallery-04.jpg",
        alt: "Security agents of 3.R.B Maroc",
      },
      {
        src: "/images/companies/3rb-maroc/gallery-05.jpg",
        alt: "Guarding",
      },
      {
        src: "/images/companies/3rb-maroc/gallery-06.jpg",
        alt: "Surveillance",
      },
    ],
  },
  {
    slug: "el-rhrib-cash",
    apiKey: "el_rhrib_cash",
    name: "EL RHRIB CASH",
    activity: "Money transfer, billing facilitation and courier",
    tagline: "Money transfer, billing facilitation and courier",
    description:
      "EL RHRIB CASH specialises in money transfer, billing facilitation and courier services. We partner with financial institutions and mobile operators for transfers, and offer billing facilitation for companies and individuals as well as courier handling.",
    services: [
      "Money transfer",
      "Billing facilitation",
      "Courier service",
    ],
    heroImage: "/images/companies/el-rhrib-cash/hero.jpg",
    gallery: [
      {
        src: "/images/companies/el-rhrib-cash/gallery-01.jpg",
        alt: "EL RHRIB CASH — money transfer and courier",
      },
    ],
  },
] as const;

export const PUBLIC_COMPANY_SLUGS = PUBLIC_COMPANIES.map((c) => c.slug);

export function getPublicCompany(slug: string): PublicCompany | undefined {
  return PUBLIC_COMPANIES.find((c) => c.slug === slug);
}
