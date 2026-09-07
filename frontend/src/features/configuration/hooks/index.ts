// features/configuration/hooks/index.ts
/**
 * Configuration Hooks — TanStack Query wrappers.
 *
 * EntitySection manages its own CRUD mutations via the `crud` prop; this file
 * only keeps the read hook used for auxiliary lookups (e.g. parent-category
 * options inside the categories tab).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { configurationApi } from "../api";
import type {
  ConfigEntityKey,
  ConfigListParams,
  PaginatedResponse,
} from "../types";

export function useConfigEntityList<T>(
  entity: ConfigEntityKey,
  params: ConfigListParams = {},
  options?: Partial<UseQueryOptions<PaginatedResponse<T>, Error>>,
) {
  return useQuery({
    queryKey: ["configuration", entity, "list", params],
    queryFn: () =>
      configurationApi[entity].list(params) as Promise<PaginatedResponse<T>>,
    placeholderData: (previousData) => previousData,
    ...(options as object),
  });
}
