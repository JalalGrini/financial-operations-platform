"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tresorerieApi } from "./api";
import type { BudgetRange, DailyBudgetCard } from "./types";

export const tresorerieQueryKeys = {
  all: ["tresorerie"] as const,
  today: () => [...tresorerieQueryKeys.all, "today"] as const,
  history: (company: string, range: BudgetRange) =>
    [...tresorerieQueryKeys.all, "history", company, range] as const,
};

export function useDailyBudgets() {
  return useQuery({
    queryKey: tresorerieQueryKeys.today(),
    queryFn: tresorerieApi.listToday,
    staleTime: 30_000,
  });
}

export function useDailyBudgetHistory(company: string, range: BudgetRange) {
  return useQuery({
    queryKey: tresorerieQueryKeys.history(company, range),
    queryFn: () => tresorerieApi.history(company, range),
    enabled: Boolean(company),
    staleTime: 30_000,
  });
}

export function useUpsertDailyBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: tresorerieApi.upsertToday,
    onSuccess: (data) => {
      queryClient.setQueryData(tresorerieQueryKeys.today(), (current: DailyBudgetCard[] | undefined) =>
        replaceTodayCard(current, data),
      );
      queryClient.invalidateQueries({ queryKey: tresorerieQueryKeys.all });
    },
  });
}

export function replaceTodayCard(
  cards: DailyBudgetCard[] | undefined,
  next: DailyBudgetCard,
): DailyBudgetCard[] {
  const rows = cards ?? [];
  return rows.map((row) => (row.company === next.company ? { ...row, ...next } : row));
}
