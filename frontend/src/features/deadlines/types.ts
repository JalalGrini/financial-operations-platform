export type DeadlinePeriodType =
  | "one_time"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "custom";

/** One period of a recurring deadline and whether it was honoured. */
export type DeadlineOccurrence = {
  id: string;
  sequence: number;
  due_at: string;
  /** Human period key, e.g. "2026-08" monthly or "2026-Q3" quarterly. */
  period_label: string;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
  is_completed: boolean;
};

export type Deadline = {
  id: string;
  title: string;
  description: string;
  company: string | null;
  company_name: string | null;
  owner: string | null;
  owner_name: string | null;
  /**
   * The *current* period's due date. Completing a recurring deadline does not
   * move this - it only advances once the date has passed. Use `next_due_at`
   * to show what is coming.
   */
  due_at: string;
  status: "upcoming" | "completed" | "cancelled";
  computed_status: "upcoming" | "due_soon" | "overdue" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  period_type: DeadlinePeriodType;
  recurrence_days: number | null;
  is_recurring: boolean;
  current_period_label: string;
  is_current_period_completed: boolean;
  /** Running total of periods honoured - the "counted up" figure. */
  completed_periods_count: number;
  next_due_at: string | null;
  /** Most recent periods first, capped server-side. */
  occurrences: DeadlineOccurrence[];
  channel: string;
  destination: string;
  completed_at: string | null;
  created_at: string;
};

export type DeadlinePayload = {
  title: string;
  description?: string;
  company?: string | null;
  owner?: string | null;
  due_at: string;
  priority?: string;
  channel?: string;
  destination?: string;
  period_type?: DeadlinePeriodType;
  recurrence_days?: number | null;
};
