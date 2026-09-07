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
    activity: "Nettoyage, désinfection, personnel technique et évènementiels",
    tagline:
      "Sté 3.R.B extrême est spécialisé dans le domaine de Nettoyages, de Désinfection, de Gestion Personnelle Technique et d’Évènementiels",
    description:
      "3RB Extreme propose des services de nettoyage professionnel pour les entreprises et les particuliers. Nos équipes qualifiées et expérimentées assurent le nettoyage de bureaux, de commerces, d’immeubles, de chantiers et bien d’autres espaces. Nous utilisons des produits respectueux de l’environnement et sommes à l’écoute de nos clients pour répondre à leurs besoins spécifiques. En ce qui concerne la désinfection, notre entreprise dispose de toutes les compétences et des équipements nécessaires pour éliminer les bactéries, les virus et autres agents pathogènes de votre environnement. Notre service de gestion personnelle technique propose des solutions pour l’entretien et la maintenance de vos équipements. Enfin, nous proposons également des services d’évènementiels pour l’organisation et la gestion d’évènements privés ou professionnels.",
    services: [
      "Nettoyage professionnel",
      "Désinfection",
      "Gestion Personnelle Technique",
      "Évènementiels",
      "Nettoyage de bureaux",
      "Nettoyage de commerces",
      "Nettoyage immeubles",
      "Nettoyage des chantiers",
    ],
    heroImage: "/images/companies/3rb-extreme/hero.jpg",
    gallery: [
      {
        src: "/images/companies/3rb-extreme/gallery-01.jpg",
        alt: "Nettoyage de bureaux",
      },
      {
        src: "/images/companies/3rb-extreme/gallery-02.png",
        alt: "Nettoyage de commerces",
      },
      {
        src: "/images/companies/3rb-extreme/gallery-03.jpg",
        alt: "Nettoyage d’immeubles",
      },
      {
        src: "/images/companies/3rb-extreme/gallery-04.jpg",
        alt: "Nettoyage des chantiers",
      },
      {
        src: "/images/companies/3rb-extreme/gallery-05.jpg",
        alt: "Lavage des véhicules",
      },
      {
        src: "/images/companies/3rb-extreme/gallery-06.jpg",
        alt: "Nettoyage d’espaces",
      },
      {
        src: "/images/companies/3rb-extreme/gallery-07.jpg",
        alt: "Équipes 3.R.B Extrême",
      },
    ],
  },
  {
    slug: "3rb-maroc",
    apiKey: "3rb_maroc",
    name: "3.R.B Maroc",
    activity: "Gardiennage et protection des entreprises, résidences et événements",
    tagline: "Sté 3.R.B Maroc spécialisé dans le domaine de Gardiennage",
    description:
      "3.R.B Maroc spécialisée dans le domaine de gardiennage propose des services de sécurité pour les entreprises et les particuliers. Nous sommes en mesure de répondre à tous vos besoins de sécurité, que ce soit pour la protection de votre entreprise, de votre résidence, ou lors d’événements spéciaux. Nos agents de sécurité sont formés et qualifiés pour assurer la protection de vos biens et de vos personnes. Nous proposons des services de surveillance et de patrouille, de contrôle d’accès, et de sécurité événementielle.",
    services: [
      "Protection des entreprises",
      "Protection des résidences",
      "Protection des événements spéciaux",
      "Surveillance et patrouille",
      "Contrôle d’accès",
    ],
    heroImage: "/images/companies/3rb-maroc/hero.jpg",
    gallery: [
      {
        src: "/images/companies/3rb-maroc/gallery-01.jpg",
        alt: "Protection des entreprises",
      },
      {
        src: "/images/companies/3rb-maroc/gallery-02.jpg",
        alt: "Protection des résidences",
      },
      {
        src: "/images/companies/3rb-maroc/gallery-03.jpg",
        alt: "Protection des événements spéciaux",
      },
      {
        src: "/images/companies/3rb-maroc/gallery-04.jpg",
        alt: "Agents de sécurité 3.R.B Maroc",
      },
      {
        src: "/images/companies/3rb-maroc/gallery-05.jpg",
        alt: "Gardiennage",
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
    activity: "Transfert d’argent, facilitation de facturation et messagerie",
    tagline: "transfert d'argent, facilitation de facturation, la messagerie",
    description:
      "EL RHRIB CASH est une entreprise spécialisée dans le transfert d’argent, les services de facilitation de facturation et la messagerie. Nous sommes passionnés par notre métier et nous nous efforçons constamment de fournir les meilleurs services possibles à nos clients. Notre entreprise propose des solutions innovantes pour les transferts d’argent à travers le monde, en partenariat avec des institutions financières et des opérateurs de téléphonie mobile. Nous offrons également des services de facilitation de facturation pour les entreprises et les particuliers, ainsi que des services de messagerie.",
    services: [
      "Transfert d'argent",
      "Facilitation de facturation",
      "Messagerie",
    ],
    heroImage: "/images/companies/el-rhrib-cash/hero.jpg",
    gallery: [
      {
        src: "/images/companies/el-rhrib-cash/gallery-01.jpg",
        alt: "EL RHRIB CASH — transfert d’argent et messagerie",
      },
    ],
  },
] as const;

export const PUBLIC_COMPANY_SLUGS = PUBLIC_COMPANIES.map((c) => c.slug);

export function getPublicCompany(slug: string): PublicCompany | undefined {
  return PUBLIC_COMPANIES.find((c) => c.slug === slug);
}
