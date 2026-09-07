import { sourceText } from "@/lib/i18n/source-catalog";
/**
 * Shared Personnel Constants
 * Centralized constants to eliminate duplication across Personnel pages
 */
import {
  PersonnelStatus,
  EmploymentStatus,
  PayrollStatus,
  CNSSSituation,
  CNSSMonthlySituation,
  CNSSMonthlyStatus,
  ContractType,
} from "../types";
// ============ Status Options ============
export const PERSONNEL_STATUS_OPTIONS = [
  {
    value: "",
    get label() {
      return sourceText("All Status");
    },
  },
  {
    value: PersonnelStatus.ACTIVE,
    get label() {
      return sourceText("Active");
    },
  },
  {
    value: PersonnelStatus.INACTIVE,
    get label() {
      return sourceText("Inactive");
    },
  },
  {
    value: PersonnelStatus.SUSPENDED,
    get label() {
      return sourceText("Suspended");
    },
  },
  {
    value: PersonnelStatus.TERMINATED,
    get label() {
      return sourceText("Terminated");
    },
  },
  {
    value: PersonnelStatus.ARCHIVED,
    get label() {
      return sourceText("Archived");
    },
  },
] as const;
export const EMPLOYMENT_STATUS_OPTIONS = [
  {
    value: "",
    get label() {
      return sourceText("All Status");
    },
  },
  {
    value: EmploymentStatus.ACTIVE,
    get label() {
      return sourceText("Active");
    },
  },
  {
    value: EmploymentStatus.ON_LEAVE,
    get label() {
      return sourceText("On Leave");
    },
  },
  {
    value: EmploymentStatus.SUSPENDED,
    get label() {
      return sourceText("Suspended");
    },
  },
  {
    value: EmploymentStatus.RESIGNED,
    get label() {
      return sourceText("Resigned");
    },
  },
  {
    value: EmploymentStatus.TERMINATED,
    get label() {
      return sourceText("Terminated");
    },
  },
  {
    value: EmploymentStatus.RETIRED,
    get label() {
      return sourceText("Retired");
    },
  },
  {
    value: EmploymentStatus.FORMER,
    get label() {
      return sourceText("Former");
    },
  },
  {
    value: EmploymentStatus.CNSS_ONLY,
    get label() {
      return sourceText("CNSS Only");
    },
  },
  {
    value: EmploymentStatus.OTHER,
    get label() {
      return sourceText("Other");
    },
  },
] as const;
export const PAYROLL_STATUS_OPTIONS = [
  {
    value: "",
    get label() {
      return sourceText("All Status");
    },
  },
  {
    value: PayrollStatus.DRAFT,
    get label() {
      return sourceText("Draft");
    },
  },
  {
    value: PayrollStatus.CALCULATED,
    get label() {
      return sourceText("Calculated");
    },
  },
  {
    value: PayrollStatus.APPROVED,
    get label() {
      return sourceText("Approved");
    },
  },
  {
    value: PayrollStatus.PAID,
    get label() {
      return sourceText("Paid");
    },
  },
  {
    value: PayrollStatus.CANCELLED,
    get label() {
      return sourceText("Cancelled");
    },
  },
] as const;
export const CNSS_STATUS_OPTIONS = [
  {
    value: "",
    get label() {
      return sourceText("All Status");
    },
  },
  {
    value: CNSSSituation.DECLARED_BY_THIS_COMPANY,
    get label() {
      return sourceText("Declared by This Company");
    },
  },
  {
    value: CNSSSituation.DECLARED_BY_ANOTHER_EMPLOYER,
    get label() {
      return sourceText("Declared by Another Employer");
    },
  },
  {
    value: CNSSSituation.PERSONALLY_INSURED,
    get label() {
      return sourceText("Personally Insured");
    },
  },
  {
    value: CNSSSituation.NOT_DECLARED,
    get label() {
      return sourceText("Not Declared");
    },
  },
  {
    value: CNSSSituation.PENDING,
    get label() {
      return sourceText("Pending");
    },
  },
  {
    value: CNSSSituation.SUSPENDED,
    get label() {
      return sourceText("Suspended");
    },
  },
  {
    value: CNSSSituation.STOPPED,
    get label() {
      return sourceText("Stopped");
    },
  },
  {
    value: CNSSSituation.EXEMPT,
    get label() {
      return sourceText("Exempt");
    },
  },
  {
    value: CNSSSituation.UNKNOWN,
    get label() {
      return sourceText("Unknown");
    },
  },
  {
    value: CNSSSituation.OTHER,
    get label() {
      return sourceText("Other");
    },
  },
] as const;
// ============ Contract Type Options ============
export const CONTRACT_TYPE_OPTIONS = [
  {
    value: "",
    get label() {
      return sourceText("All Types");
    },
  },
  {
    value: ContractType.PERMANENT,
    get label() {
      return sourceText("Permanent");
    },
  },
  {
    value: ContractType.FIXED_TERM,
    get label() {
      return sourceText("Fixed-term");
    },
  },
  {
    value: ContractType.TEMPORARY,
    get label() {
      return sourceText("Temporary");
    },
  },
  {
    value: ContractType.INTERNSHIP,
    get label() {
      return sourceText("Internship");
    },
  },
  {
    value: ContractType.APPRENTICESHIP,
    get label() {
      return sourceText("Apprenticeship");
    },
  },
  {
    value: ContractType.SEASONAL,
    get label() {
      return sourceText("Seasonal");
    },
  },
  {
    value: ContractType.PART_TIME,
    get label() {
      return sourceText("Part-time");
    },
  },
  {
    value: ContractType.OTHER,
    get label() {
      return sourceText("Other");
    },
  },
] as const;
// ============ Density Options ============
export const DENSITY_OPTIONS = [
  {
    value: "comfortable",
    get label() {
      return sourceText("Comfortable");
    },
  },
  {
    value: "compact",
    get label() {
      return sourceText("Compact");
    },
  },
  {
    value: "dense",
    get label() {
      return sourceText("Dense");
    },
  },
] as const;
// ============ Export Formats ============
export const EXPORT_FORMATS = [
  {
    value: "csv",
    get label() {
      return sourceText("Export CSV");
    },
    icon: "📄",
  },
  {
    value: "xlsx",
    get label() {
      return sourceText("Export XLSX");
    },
    icon: "📊",
  },
] as const;
// ============ Archive/Restore Statuses ============
export const ARCHIVE_STATUSES = {
  personnel: [
    "inactive",
    "terminated",
    "archived",
  ],
  employment: [
    EmploymentStatus.RESIGNED,
    EmploymentStatus.TERMINATED,
    EmploymentStatus.RETIRED,
    EmploymentStatus.FORMER,
  ],
  payroll: [PayrollStatus.CANCELLED],
  cnss: [CNSSSituation.STOPPED],
} as const;
// ============ Archive/Restore Conditions ============
export const CAN_ARCHIVE = {
  personnel: (status: string) =>
    ![
      "inactive",
      "terminated",
      "archived",
    ].includes(status),
  employment: (status: string) =>
    ![
      EmploymentStatus.RESIGNED,
      EmploymentStatus.TERMINATED,
      EmploymentStatus.RETIRED,
      EmploymentStatus.FORMER,
    ].includes(status as EmploymentStatus),
  payroll: (status: string) => status === PayrollStatus.DRAFT,
  cnss: (status: string) => status !== CNSSSituation.STOPPED,
} as const;
export const CAN_RESTORE = {
  personnel: (status: string) =>
    [
      "inactive",
      "terminated",
      "archived",
    ].includes(status),
  employment: (status: string) =>
    [
      EmploymentStatus.RESIGNED,
      EmploymentStatus.TERMINATED,
      EmploymentStatus.RETIRED,
      EmploymentStatus.FORMER,
    ].includes(status as EmploymentStatus),
  payroll: (status: string) => status === PayrollStatus.CANCELLED,
  cnss: (status: string) => status === CNSSSituation.STOPPED,
} as const;
// ============ Dialog Labels ============
export const DIALOG_LABELS = {
  archive: {
    get single() {
      return sourceText("Archive {entity}");
    },
    get multiple() {
      return sourceText("Archive {count} {entities}");
    },
    description: {
      get single() {
        return sourceText(
          "Are you sure you want to archive this {entity}? This action can be reversed.",
        );
      },
      get multiple() {
        return sourceText(
          "Are you sure you want to archive {count} {entities}? This action can be reversed.",
        );
      },
    },
    get confirmLabel() {
      return sourceText("Archive");
    },
    variant: "destructive" as const,
  },
  restore: {
    get single() {
      return sourceText("Restore {entity}");
    },
    get multiple() {
      return sourceText("Restore {count} {entities}");
    },
    description: {
      get single() {
        return sourceText(
          "Are you sure you want to restore this archived {entity}?",
        );
      },
      get multiple() {
        return sourceText(
          "Are you sure you want to restore {count} archived {entities}?",
        );
      },
    },
    get confirmLabel() {
      return sourceText("Restore");
    },
    variant: "default" as const,
  },
  delete: {
    get single() {
      return sourceText("Delete {entity}");
    },
    get multiple() {
      return sourceText("Delete {count} {entities}");
    },
    description: {
      get single() {
        return sourceText(
          "Are you sure you want to permanently delete this {entity}? This action cannot be undone.",
        );
      },
      get multiple() {
        return sourceText(
          "Are you sure you want to permanently delete {count} {entities}? This action cannot be undone.",
        );
      },
    },
    get confirmLabel() {
      return sourceText("Delete");
    },
    variant: "destructive" as const,
  },
  stop: {
    get single() {
      return sourceText("Stop {entity}");
    },
    get description() {
      return sourceText(
        "Are you sure you want to stop the {entity}? This will end their coverage.",
      );
    },
    get confirmLabel() {
      return sourceText("Stop Declaration");
    },
    variant: "destructive" as const,
  },
  restart: {
    get single() {
      return sourceText("Restart {entity}");
    },
    get description() {
      return sourceText(
        "Are you sure you want to restart the {entity}? This will resume their coverage.",
      );
    },
    get confirmLabel() {
      return sourceText("Restart Declaration");
    },
    variant: "default" as const,
  },
  calculate: {
    get single() {
      return sourceText("Calculate {entity}");
    },
    get description() {
      return sourceText("Are you sure you want to calculate this {entity}?");
    },
    get confirmLabel() {
      return sourceText("Calculate");
    },
    variant: "default" as const,
  },
  approve: {
    get single() {
      return sourceText("Approve {entity}");
    },
    get description() {
      return sourceText(
        "Are you sure you want to approve this {entity}? This action cannot be undone.",
      );
    },
    get confirmLabel() {
      return sourceText("Approve");
    },
    variant: "default" as const,
  },
} as const;
// ============ Entity Names ============
export const ENTITY_NAMES = {
  personnel: {
    get singular() {
      return sourceText("personnel");
    },
    get plural() {
      return sourceText("personnel");
    },
  },
  employment: {
    get singular() {
      return sourceText("employment");
    },
    get plural() {
      return sourceText("employments");
    },
  },
  payroll: {
    get singular() {
      return sourceText("payroll record");
    },
    get plural() {
      return sourceText("payroll records");
    },
  },
  cnss: {
    get singular() {
      return sourceText("CNSS declaration");
    },
    get plural() {
      return sourceText("CNSS declarations");
    },
  },
  payrollRecord: {
    get singular() {
      return sourceText("payroll");
    },
    get plural() {
      return sourceText("payroll records");
    },
  },
} as const;
// ============ Page Size Options ============
export const PAGE_SIZE_OPTIONS = [
  {
    value: 10,
    get label() {
      return sourceText("10 per page");
    },
  },
  {
    value: 25,
    get label() {
      return sourceText("25 per page");
    },
  },
  {
    value: 50,
    get label() {
      return sourceText("50 per page");
    },
  },
  {
    value: 100,
    get label() {
      return sourceText("100 per page");
    },
  },
] as const;
// ============ Search Placeholders ============
export const SEARCH_PLACEHOLDERS = {
  get personnel() {
    return sourceText("Search by name, CIN, email, phone...");
  },
  get employments() {
    return sourceText("Search by person, company, job title...");
  },
  get payroll() {
    return sourceText("Search by employee, company, reference...");
  },
  get cnss() {
    return sourceText("Search by person, company, CNSS #...");
  },
} as const;
// ============ Empty Messages ============
export const EMPTY_MESSAGES = {
  get personnel() {
    return sourceText("No personnel found");
  },
  get employments() {
    return sourceText("No employments found");
  },
  get payroll() {
    return sourceText("No payroll records found");
  },
  get cnss() {
    return sourceText("No CNSS declarations found");
  },
  get reports() {
    return sourceText("No data found");
  },
} as const;
// ============ Empty Icons ============
export const EMPTY_ICONS = {
  personnel: "👥",
  employments: "💼",
  payroll: "💼",
  cnss: "📋",
  reports: "📄",
} as const;
// ============ Loading Messages ============
export const LOADING_MESSAGES = {
  get personnel() {
    return sourceText("Loading personnel...");
  },
  get employments() {
    return sourceText("Loading employments...");
  },
  get payroll() {
    return sourceText("Loading payroll...");
  },
  get cnss() {
    return sourceText("Loading CNSS declarations...");
  },
  get reports() {
    return sourceText("Loading report...");
  },
} as const;
// ============ Error Messages ============
export const ERROR_MESSAGES = {
  failedToLoad: (entity: string) => `Failed to load ${entity}`,
  get exportFailed() {
    return sourceText("Export failed");
  },
  createFailed: (entity: string) => `Failed to create ${entity}`,
  updateFailed: (entity: string) => `Failed to update ${entity}`,
  deleteFailed: (entity: string) => `Failed to delete ${entity}`,
  archiveFailed: (entity: string) => `Failed to archive ${entity}`,
  restoreFailed: (entity: string) => `Failed to restore ${entity}`,
  get calculateFailed() {
    return sourceText("Failed to calculate");
  },
  get approveFailed() {
    return sourceText("Failed to approve");
  },
  get bulkCreateFailed() {
    return sourceText("Failed to create records");
  },
  get bulkCalculateFailed() {
    return sourceText("Failed to calculate records");
  },
  get bulkApproveFailed() {
    return sourceText("Failed to approve records");
  },
} as const;
// ============ Success Messages ============
export const SUCCESS_MESSAGES = {
  created: (entity: string) => `${entity} created successfully`,
  updated: (entity: string) => `${entity} updated successfully`,
  deleted: (entity: string) => `${entity} deleted successfully`,
  archived: (entity: string) => `${entity} archived successfully`,
  restored: (entity: string) => `${entity} restored successfully`,
  get exported() {
    return sourceText("Export completed successfully");
  },
  get calculated() {
    return sourceText("Calculated successfully");
  },
  get approved() {
    return sourceText("Approved successfully");
  },
} as const;
// ============ Page Titles & Descriptions ============
export const PAGE_CONFIG = {
  personnel: {
    get title() {
      return sourceText("Personnel");
    },
    get description() {
      return sourceText(
        "Manage personnel records, employments, and CNSS declarations",
      );
    },
    get listTitle() {
      return sourceText("Personnel");
    },
    get listDescription() {
      return sourceText(
        "Manage personnel records, employments, and CNSS declarations",
      );
    },
    get createTitle() {
      return sourceText("Create Personnel");
    },
    get createDescription() {
      return sourceText("Add a new personnel record to the system");
    },
    get editTitle() {
      return sourceText("Edit Personnel");
    },
    editDescription: (name: string) => `Update details for ${name}`,
    profileTitle: (name: string) => name,
    profileDescription: (ref: string, cin?: string) =>
      `Reference: ${ref} • ${cin || "No CIN"}`,
  },
  employments: {
    get title() {
      return sourceText("Employments");
    },
    get description() {
      return sourceText(
        "Manage employment records, contracts, and job assignments",
      );
    },
    get listTitle() {
      return sourceText("Employments");
    },
    get listDescription() {
      return sourceText(
        "Manage employment records, contracts, and job assignments",
      );
    },
    get createTitle() {
      return sourceText("Create Employment");
    },
    get createDescription() {
      return sourceText("Add a new employment record");
    },
  },
  payroll: {
    get title() {
      return sourceText("Payroll");
    },
    get description() {
      return sourceText(
        "Manage monthly payroll records, calculations, and approvals",
      );
    },
    get listTitle() {
      return sourceText("Payroll");
    },
    get listDescription() {
      return sourceText(
        "Manage monthly payroll records, calculations, and approvals",
      );
    },
    get createTitle() {
      return sourceText("Create Payroll");
    },
    get createDescription() {
      return sourceText("Create a new payroll record");
    },
  },
  cnss: {
    get title() {
      return sourceText("CNSS Declarations");
    },
    get description() {
      return sourceText(
        "Manage CNSS declarations, monthly submissions, and compliance",
      );
    },
    get listTitle() {
      return sourceText("CNSS Declarations");
    },
    get listDescription() {
      return sourceText(
        "Manage CNSS declarations, monthly submissions, and compliance",
      );
    },
    get createTitle() {
      return sourceText("Create CNSS Declaration");
    },
    get createDescription() {
      return sourceText("Add a new CNSS declaration");
    },
  },
  reports: {
    get title() {
      return sourceText("Reports");
    },
    get description() {
      return sourceText("Generate and export personnel reports");
    },
    get cnssTitle() {
      return sourceText("CNSS Monthly Report");
    },
    get cnssDescription() {
      return sourceText(
        "Monthly CNSS declaration report with entrant/sortant/active status",
      );
    },
    get payrollTitle() {
      return sourceText("Payroll Monthly Report");
    },
    get payrollDescription() {
      return sourceText(
        "Monthly payroll report with salaries, payments, and deductions",
      );
    },
  },
  settings: {
    get title() {
      return sourceText("Personnel Settings");
    },
    get description() {
      return sourceText("Configure personnel module preferences and defaults");
    },
  },
} as const;
// ============ Breadcrumb Items ============
export const BREADCRUMB_ITEMS = {
  personnel: [
    {
      get label() {
        return sourceText("Personnel");
      },
      get href() {
        return sourceText("/personnel");
      },
    },
  ],
  personnelList: [
    {
      get label() {
        return sourceText("Personnel");
      },
      get href() {
        return sourceText("/personnel");
      },
    },
    {
      get label() {
        return sourceText("Personnel List");
      },
      get href() {
        return sourceText("/personnel/personnel");
      },
    },
  ],
  personnelNew: [
    {
      get label() {
        return sourceText("Personnel");
      },
      get href() {
        return sourceText("/personnel");
      },
    },
    {
      get label() {
        return sourceText("Personnel List");
      },
      get href() {
        return sourceText("/personnel/personnel");
      },
    },
    {
      get label() {
        return sourceText("Create Personnel");
      },
      isCurrent: true,
    },
  ],
  personnelEdit: (name: string) => [
    {
      get label() {
        return sourceText("Personnel");
      },
      get href() {
        return sourceText("/personnel");
      },
    },
    {
      get label() {
        return sourceText("Personnel List");
      },
      get href() {
        return sourceText("/personnel/personnel");
      },
    },
    { label: name, isCurrent: true },
  ],
  personnelProfile: (name: string) => [
    {
      get label() {
        return sourceText("Personnel");
      },
      get href() {
        return sourceText("/personnel");
      },
    },
    {
      get label() {
        return sourceText("Personnel List");
      },
      get href() {
        return sourceText("/personnel/personnel");
      },
    },
    { label: name, isCurrent: true },
  ],
  employments: [
    {
      get label() {
        return sourceText("Personnel");
      },
      get href() {
        return sourceText("/personnel");
      },
    },
    {
      get label() {
        return sourceText("Employments");
      },
      isCurrent: true,
    },
  ],
  payroll: [
    {
      get label() {
        return sourceText("Personnel");
      },
      get href() {
        return sourceText("/personnel");
      },
    },
    {
      get label() {
        return sourceText("Payroll");
      },
      isCurrent: true,
    },
  ],
  cnss: [
    {
      get label() {
        return sourceText("Personnel");
      },
      get href() {
        return sourceText("/personnel");
      },
    },
    {
      get label() {
        return sourceText("CNSS");
      },
      isCurrent: true,
    },
  ],
  reports: [
    {
      get label() {
        return sourceText("Personnel");
      },
      get href() {
        return sourceText("/personnel");
      },
    },
    {
      get label() {
        return sourceText("Reports");
      },
      isCurrent: true,
    },
  ],
  settings: [
    {
      get label() {
        return sourceText("Personnel");
      },
      get href() {
        return sourceText("/personnel");
      },
    },
    {
      get label() {
        return sourceText("Settings");
      },
      isCurrent: true,
    },
  ],
} as const;
// ============ Toolbar Config ============
export const TOOLBAR_CONFIG = {
  personnel: {
    get searchPlaceholder() {
      return sourceText("Search by name, CIN, email, phone...");
    },
    filters: [
      {
        get key() {
          return sourceText("status");
        },
        get label() {
          return sourceText("Status");
        },
        get optionsKey() {
          return sourceText("personnel");
        },
      },
      {
        get key() {
          return sourceText("company");
        },
        get label() {
          return sourceText("Company");
        },
        get optionsKey() {
          return sourceText("companies");
        },
      },
    ],
    actions: ["export", "density", "archived", "refresh"],
  },
  employments: {
    get searchPlaceholder() {
      return sourceText("Search by person, company, job title...");
    },
    filters: [
      {
        get key() {
          return sourceText("status");
        },
        get label() {
          return sourceText("Status");
        },
        get optionsKey() {
          return sourceText("employment");
        },
      },
      {
        get key() {
          return sourceText("company");
        },
        get label() {
          return sourceText("Company");
        },
        get optionsKey() {
          return sourceText("companies");
        },
      },
      {
        get key() {
          return sourceText("person");
        },
        get label() {
          return sourceText("Personnel");
        },
        get optionsKey() {
          return sourceText("personnel");
        },
      },
    ],
    actions: ["export", "density", "archived", "refresh"],
  },
  payroll: {
    get searchPlaceholder() {
      return sourceText("Search by employee, company, reference...");
    },
    filters: [
      {
        get key() {
          return sourceText("status");
        },
        get label() {
          return sourceText("Status");
        },
        get optionsKey() {
          return sourceText("payroll");
        },
      },
      {
        get key() {
          return sourceText("company");
        },
        get label() {
          return sourceText("Company");
        },
        get optionsKey() {
          return sourceText("companies");
        },
      },
      {
        get key() {
          return sourceText("employment");
        },
        get label() {
          return sourceText("Employment");
        },
        get optionsKey() {
          return sourceText("employment");
        },
      },
    ],
    actions: ["export", "density", "bulkCreate", "refresh"],
  },
  cnss: {
    get searchPlaceholder() {
      return sourceText("Search by person, company, CNSS #...");
    },
    filters: [
      {
        get key() {
          return sourceText("status");
        },
        get label() {
          return sourceText("Status");
        },
        get optionsKey() {
          return sourceText("cnss");
        },
      },
      {
        get key() {
          return sourceText("company");
        },
        get label() {
          return sourceText("Company");
        },
        get optionsKey() {
          return sourceText("companies");
        },
      },
      {
        get key() {
          return sourceText("person");
        },
        get label() {
          return sourceText("Personnel");
        },
        get optionsKey() {
          return sourceText("personnel");
        },
      },
    ],
    actions: ["export", "density", "archived", "refresh"],
  },
  reports: {
    searchPlaceholder: "",
    filters: [
      {
        get key() {
          return sourceText("reportType");
        },
        get label() {
          return sourceText("Report Type");
        },
        get optionsKey() {
          return sourceText("reportType");
        },
      },
      {
        get key() {
          return sourceText("year");
        },
        get label() {
          return sourceText("Year");
        },
        get optionsKey() {
          return sourceText("year");
        },
      },
      {
        get key() {
          return sourceText("month");
        },
        get label() {
          return sourceText("Month");
        },
        get optionsKey() {
          return sourceText("month");
        },
      },
      {
        get key() {
          return sourceText("company");
        },
        get label() {
          return sourceText("Company");
        },
        get optionsKey() {
          return sourceText("companies");
        },
      },
      {
        get key() {
          return sourceText("personnel");
        },
        get label() {
          return sourceText("Personnel");
        },
        get optionsKey() {
          return sourceText("personnel");
        },
      },
    ],
    actions: ["export", "refresh"],
  },
} as const;
