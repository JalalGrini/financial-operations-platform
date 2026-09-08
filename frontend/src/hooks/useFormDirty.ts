"use client";

import { useMemo } from "react";

function normalize(value: unknown): unknown {
  if (value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, normalize(item)] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries);
  }
  return value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export function useFormDirty<T extends Record<string, unknown>>(
  originalValues: T | null | undefined,
  currentValues: T | Record<string, unknown>,
): boolean {
  return useMemo(() => {
    if (!originalValues) return false;
    const original = originalValues as Record<string, unknown>;
    const current = (currentValues || {}) as Record<string, unknown>;
    return Object.keys(original).some(
      (key) => !valuesEqual(original[key], current[key]),
    );
  }, [originalValues, currentValues]);
}
