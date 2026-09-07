import { designTokens } from "./design-tokens";

function localeTag() {
  if (typeof document !== "undefined") {
    const lang = (document.documentElement.lang || "fr").toLowerCase();
    if (lang.startsWith("ar")) return "ar-MA";
    if (lang.startsWith("en")) return "en-GB";
  }
  return "fr-MA";
}

export const designSystem = {
  colors: {
    ...designTokens.colors,
    semantic: {
      primary: {
        light: "hsl(var(--primary) / 0.1)",
        DEFAULT: "hsl(var(--primary))",
        foreground: "hsl(var(--primary-foreground))",
        hover: "hsl(var(--primary) / 0.9)",
        active: "hsl(var(--primary) / 1)",
        ring: "hsl(var(--ring))",
      },
      secondary: {
        light: "hsl(var(--secondary) / 0.1)",
        DEFAULT: "hsl(var(--secondary))",
        foreground: "hsl(var(--secondary-foreground))",
        hover: "hsl(var(--secondary) / 0.8)",
      },
      destructive: {
        light: "hsl(var(--destructive) / 0.1)",
        DEFAULT: "hsl(var(--destructive))",
        foreground: "hsl(var(--destructive-foreground))",
        hover: "hsl(var(--destructive) / 0.9)",
      },
      muted: {
        light: "hsl(var(--muted) / 0.1)",
        DEFAULT: "hsl(var(--muted))",
        foreground: "hsl(var(--muted-foreground))",
      },
      accent: {
        light: "hsl(var(--accent) / 0.1)",
        DEFAULT: "hsl(var(--accent))",
        foreground: "hsl(var(--accent-foreground))",
        hover: "hsl(var(--accent) / 0.8)",
      },
      background: "hsl(var(--background))",
      foreground: "hsl(var(--foreground))",
      card: {
        DEFAULT: "hsl(var(--card))",
        foreground: "hsl(var(--card-foreground))",
      },
      popover: {
        DEFAULT: "hsl(var(--popover))",
        foreground: "hsl(var(--popover-foreground))",
      },
      border: "hsl(var(--border))",
      input: "hsl(var(--input))",
      ring: "hsl(var(--ring))",
    },
    status: {
      success: designTokens.colors.status.success,
      warning: designTokens.colors.status.warning,
      danger: designTokens.colors.status.danger,
      info: designTokens.colors.status.info,
      archived: designTokens.colors.status.archived,
      cnss: designTokens.colors.status.cnss,
      payroll: designTokens.colors.status.payroll,
    },
    financial: {
      positive: designTokens.colors.financial.positive,
      negative: designTokens.colors.financial.negative,
      neutral: designTokens.colors.financial.neutral,
    },
  },
  spacing: {
    ...designTokens.spacing,
    component: {
      xs: "0.25rem",
      sm: "0.5rem",
      md: "1rem",
      lg: "1.5rem",
      xl: "2rem",
    },
    layout: {
      xs: "0.5rem",
      sm: "1rem",
      md: "1.5rem",
      lg: "2rem",
      xl: "3rem",
      "2xl": "4rem",
    },
    section: "2rem",
    page: "1.5rem",
    container: "1rem",
  },
  radius: {
    ...designTokens.radius,
    component: {
      none: "0",
      xs: "0.125rem",
      sm: "0.25rem",
      DEFAULT: "0.375rem",
      md: "0.5rem",
      lg: "0.75rem",
      xl: "1rem",
      "2xl": "1.5rem",
      full: "9999px",
    },
  },
  shadow: {
    ...designTokens.shadow,
    component: {
      none: "none",
      xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      sm: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
      DEFAULT:
        "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
      md: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
      lg: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
      xl: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
      elevation: {
        0: "none",
        1: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        2: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        3: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
        4: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
      },
    },
  },
  transition: {
    ...designTokens.transition,
    component: {
      fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
      DEFAULT: "200ms cubic-bezier(0.4, 0, 0.2, 1)",
      slow: "300ms cubic-bezier(0.4, 0, 0.2, 1)",
    },
  },
  typography: {
    ...designTokens.typography,
    component: {
      display: {
        xl: [
          "4.5rem",
          { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        lg: [
          "3.75rem",
          { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        md: [
          "3rem",
          { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        sm: [
          "2.25rem",
          { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "700" },
        ],
        xs: [
          "1.875rem",
          { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "700" },
        ],
      },
      heading: {
        h1: [
          "2.25rem",
          { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "700" },
        ],
        h2: [
          "1.875rem",
          { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
        h3: [
          "1.5rem",
          { lineHeight: "1.4", letterSpacing: "0", fontWeight: "600" },
        ],
        h4: [
          "1.25rem",
          { lineHeight: "1.4", letterSpacing: "0", fontWeight: "600" },
        ],
        h5: [
          "1.125rem",
          { lineHeight: "1.5", letterSpacing: "0", fontWeight: "600" },
        ],
        h6: [
          "1rem",
          { lineHeight: "1.5", letterSpacing: "0", fontWeight: "600" },
        ],
      },
      body: {
        lg: [
          "1.125rem",
          { lineHeight: "1.75", letterSpacing: "0", fontWeight: "400" },
        ],
        DEFAULT: [
          "1rem",
          { lineHeight: "1.5", letterSpacing: "0", fontWeight: "400" },
        ],
        sm: [
          "0.875rem",
          { lineHeight: "1.5", letterSpacing: "0", fontWeight: "400" },
        ],
        xs: [
          "0.75rem",
          { lineHeight: "1.5", letterSpacing: "0.025em", fontWeight: "400" },
        ],
      },
      label: {
        lg: [
          "1rem",
          { lineHeight: "1.5", letterSpacing: "0", fontWeight: "500" },
        ],
        DEFAULT: [
          "0.875rem",
          { lineHeight: "1.5", letterSpacing: "0", fontWeight: "500" },
        ],
        sm: [
          "0.75rem",
          { lineHeight: "1.5", letterSpacing: "0.025em", fontWeight: "500" },
        ],
      },
      code: {
        DEFAULT: [
          "0.875rem",
          {
            lineHeight: "1.5",
            letterSpacing: "0",
            fontFamily: "monospace",
            fontWeight: "400",
          },
        ],
        sm: [
          "0.75rem",
          {
            lineHeight: "1.5",
            letterSpacing: "0",
            fontFamily: "monospace",
            fontWeight: "400",
          },
        ],
      },
      tabular: "tabular-nums",
    },
  },
  layout: {
    ...designTokens.layout,
    container: {
      xs: "20rem",
      sm: "24rem",
      md: "28rem",
      lg: "32rem",
      xl: "36rem",
      "2xl": "42rem",
      "3xl": "48rem",
      "4xl": "56rem",
      "5xl": "64rem",
      "6xl": "72rem",
      "7xl": "80rem",
      "8xl": "96rem",
      full: "100%",
    },
    maxWidth: {
      content: "80rem",
      page: "96rem",
      form: "48rem",
      dialog: "32rem",
      dialogLg: "48rem",
      sidebar: "16rem",
      sidebarCollapsed: "4rem",
    },
    headerHeight: "4rem",
    sidebarWidth: "16rem",
    sidebarCollapsedWidth: "4rem",
  },
  density: {
    ...designTokens.density,
    table: {
      comfortable: "1",
      compact: "0.875",
      dense: "0.75",
    },
  },
  breakpoints: {
    ...designTokens.breakpoints,
  },
  zIndex: {
    base: "0",
    dropdown: "100",
    sticky: "200",
    header: "300",
    sidebar: "400",
    overlay: "500",
    modal: "600",
    popover: "700",
    tooltip: "800",
    toast: "900",
  },
  animation: {
    duration: {
      fast: "150ms",
      DEFAULT: "200ms",
      slow: "300ms",
    },
    easing: {
      DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)",
      in: "cubic-bezier(0.4, 0, 1, 1)",
      out: "cubic-bezier(0, 0, 0.2, 1)",
      inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
    },
  },
} as const;

export type DesignSystem = typeof designSystem;

export const getStatusColor = (
  status: string,
  variant:
    | "personnel"
    | "employment"
    | "payroll"
    | "cnssMonthly"
    | "cnssSituation"
    | "cnssMonthlySituation",
) => {
  const statusMap =
    designTokens.colors.status[
      variant as keyof typeof designTokens.colors.status
    ];
  return (
    statusMap?.[status as keyof typeof statusMap] ||
    designTokens.colors.status.archived
  );
};

export const getFinancialColor = (value: number) => {
  if (value > 0) return designTokens.colors.financial.positive;
  if (value < 0) return designTokens.colors.financial.negative;
  return designTokens.colors.financial.neutral;
};

export const formatCurrency = (
  amount: number | null | undefined,
  currency = "MAD",
  options: Intl.NumberFormatOptions = {},
) => {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat(localeTag(), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(amount);
};

export const formatNumber = (
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
) => {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(localeTag(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
};

export const formatDate = (
  date: string | null | undefined,
  format: "short" | "medium" | "long" = "short",
  options: Intl.DateTimeFormatOptions = {},
) => {
  if (!date) return "—";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) throw new Error("Invalid date");
    if (options.dateStyle != null || options.timeStyle != null) {
      return d.toLocaleString(localeTag(), {
        ...(options.dateStyle ? { dateStyle: options.dateStyle } : {}),
        ...(options.timeStyle ? { timeStyle: options.timeStyle } : {}),
      });
    }
    return d.toLocaleDateString(localeTag(), {
      year: "numeric",
      month: format === "short" ? "2-digit" : "long",
      day: "2-digit",
      ...(options.hour ? { hour: options.hour } : {}),
      ...(options.minute ? { minute: options.minute } : {}),
    });
  } catch {
    return "—";
  }
};

export const cn = (
  ...classes: (string | boolean | undefined | null | Record<string, boolean>)[]
) => {
  return classes
    .filter(Boolean)
    .map((cls) => {
      if (typeof cls === "object" && cls !== null) {
        return Object.entries(cls)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(" ");
      }
      return cls;
    })
    .join(" ");
};

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
export const transitionBase = "transition-colors duration-200 ease-in-out";
export const transitionAll = "transition-all duration-200 ease-in-out";
