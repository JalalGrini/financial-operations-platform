import { apiClient } from "@/lib/api";
import type { BudgetRange, DailyBudgetCard, DailyBudgetHistoryPoint } from "./types";

export const tresorerieApi = {
  listToday: async (): Promise<DailyBudgetCard[]> => {
    return apiClient.get<DailyBudgetCard[]>("/treasury/budgets/");
  },
  upsertToday: async (data: {
    company: string;
    amount: number;
    note?: string;
    date?: string;
  }): Promise<DailyBudgetCard> => {
    return apiClient.post<DailyBudgetCard>("/treasury/budgets/", data);
  },
  history: async (
    company: string,
    range: BudgetRange,
  ): Promise<DailyBudgetHistoryPoint[]> => {
    const search = new URLSearchParams({ company, range });
    return apiClient.get<DailyBudgetHistoryPoint[]>(
      `/treasury/budgets/history/?${search.toString()}`,
    );
  },
};
