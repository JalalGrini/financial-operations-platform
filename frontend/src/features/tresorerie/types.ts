export type DailyBudgetCard = {
  id: string | null;
  company: string;
  company_name: string;
  date: string;
  amount: string | null;
  note: string;
  filled_by: string | null;
  filled_by_name: string;
  filled_at: string | null;
  is_carried_over: boolean;
  is_filled_today: boolean;
};

export type DailyBudgetHistoryPoint = {
  date: string;
  amount: string | null;
  is_carried_over: boolean;
  source_date: string | null;
};

export type BudgetRange = "7d" | "1m" | "1y" | "all";
