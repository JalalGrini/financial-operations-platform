// src/components/ui/index.ts
// Auto-barrel — export every UI primitive from one import path

// Base primitives
export * from "./card";
export * from "./button";
export * from "./input";
export * from "./label";
export * from "./badge";
export * from "./separator";
export * from "./switch";

// Feedback
export * from "./alert";
export * from "./toast";

// Overlay / surface
export * from "./dialog";
export * from "./dropdown-menu";
export * from "./sheet";
export * from "./scroll-area";
export * from "./tooltip";

// Data display
export * from "./table";
export * from "./tabs";
export * from "./avatar";
export * from "./stat-card";

// Skeleton / loading
export * from "./skeleton";
export * from "./spinner";
export * from "./progress";

// Navigation / pagination
export * from "./pagination";
export * from "./breadcrumb";

// Compound data components
export * from "./data-table";

// Content
export * from "./empty-state";
export * from "./kpi-card";
export * from "./page-hero";

// Utility
export * from "./copy-button";
export * from "./amount";
export * from "./timeline";
export * from "./section-header";
export * from "./steps";
export * from "./stat";
export * from "./filter-chip";
export * from "./definition-list";
export * from "./file-upload";

// Form layout
export * from "./form-section";

// Toolbar / page controls
export * from "./page-toolbar";

// Navigation
export * from "./header";

// V16 new components
export * from "./switch-mode";
export * from "./logo";
export * from "./language-switcher";
export * from "./date-range-picker";
export * from "./collapsible-stats";
export * from "./reply-channel-toggle";
export * from "./employee-avatar";
export * from "./tagged-widget";
export * from "./expanding-actions";
export * from "./schedule-date";
export * from "./page-skeletons";
export * from "./view-toggle";
export * from "./file-preview";
export * from "./page-transition";

// Animation / interaction
export * from "./count-up";
export * from "./stagger-list";
export * from "./floating-action-button";
export * from "./nav-progress";
export * from "./animated-card";
export * from "./pulse-indicator";
export * from "./reveal";

// Ambiguity resolution
// `./card` and `./stat-card` both declare a `StatCard`, so the two `export *`
// lines above collide (TS2308). The design-system tile in `./stat-card` (icon
// chip + tone + trend) is the one every page imports; `./card`'s simpler
// label/value/description variant has no importers. An explicit named
// re-export takes precedence over a star export, which pins the barrel to the
// intended component instead of leaving the name unresolvable.
export { StatCard } from "./stat-card";