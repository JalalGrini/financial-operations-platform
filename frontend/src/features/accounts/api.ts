import { apiClient } from "@/lib/api";
import type { RoleName } from "@/types/auth";

export type ManagedAccount = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: RoleName | null;
  is_active: boolean;
  date_joined: string | null;
  last_login: string | null;
  avatar_url: string | null;
};

type Envelope<T> = { data: T };
const data = <T>(value: Envelope<T> | T): T =>
  (value as Envelope<T>).data ?? (value as T);

export const accountsApi = {
  list: async () =>
    data<{ users: ManagedAccount[] }>(await apiClient.get("/accounts/users/")),
  create: async (payload: {
    email: string;
    first_name: string;
    last_name: string;
    role: "Assistant" | "Director";
    temporary_password: string;
  }) =>
    data<{ user: ManagedAccount }>(
      await apiClient.post("/accounts/users/", payload),
    ),
  update: async (
    id: string,
    payload: Partial<
      Pick<
        ManagedAccount,
        "first_name" | "last_name" | "role" | "is_active" | "email"
      >
    >,
  ) =>
    data<{ user: ManagedAccount }>(
      await apiClient.patch(`/accounts/users/${id}/`, payload),
    ),
  setTemporaryPassword: async (id: string, temporary_password: string) =>
    apiClient.post(`/accounts/users/${id}/temporary-password/`, {
      temporary_password,
    }),
  /**
   * One-click reset: send no password and the server generates one that
   * satisfies its own validators, then returns it once. It is never stored in
   * readable form, so this response is the only chance to show it.
   */
  resetPassword: async (id: string) =>
    data<{ temporary_password?: string }>(
      await apiClient.post(
        `/accounts/users/${id}/temporary-password/`,
        {},
      ),
    ),
  profile: async () =>
    data<{
      profile: Pick<
        ManagedAccount,
        "id" | "email" | "first_name" | "last_name" | "full_name" | "avatar_url"
      >;
    }>(await apiClient.get("/accounts/me/profile/")),
  updateProfile: async (payload: { first_name: string; last_name: string }) =>
    data<{ profile: ManagedAccount }>(
      await apiClient.patch("/accounts/me/profile/", payload),
    ),
  uploadAvatar: async (file: File) => {
    const body = new FormData();
    body.append("avatar", file);
    return apiClient.put("/accounts/me/avatar/", body);
  },
  removeAvatar: async () => apiClient.delete("/accounts/me/avatar/"),
};
