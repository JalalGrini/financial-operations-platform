import { apiClient } from "@/lib/api";
export type Notification = {
  id: string;
  category: string;
  title: string;
  message: string;
  destination: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
  actor_name?: string;
  company_name?: string;
};
export type Mention = {
  id: string;
  resource_type: string;
  object_id: string;
  target_label: string;
  destination: string;
  message: string;
  created_at: string;
  read_at: string | null;
  resolved_at: string | null;
  tagged_user: string;
  tagged_user_name: string;
  tagged_by: string;
  tagged_by_name: string;
  can_untag: boolean;
};
export type EligibleUser = {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  email: string;
  roles: string[];
};
const unwrap = <T>(value: any): T => value?.data ?? value;
export const collaborationApi = {
  notifications: async (unread = false) =>
    unwrap<any>(
      await apiClient.get(
        `/collaboration/notifications/${unread ? "?unread=true" : ""}`,
      ),
    ),
  unreadCount: async () =>
    unwrap<{ count: number }>(
      await apiClient.get("/collaboration/notifications/unread-count/"),
    ),
  read: async (id: string) =>
    unwrap<Notification>(
      await apiClient.post(`/collaboration/notifications/${id}/read/`, {}),
    ),
  readAll: async () =>
    unwrap<{ updated: number }>(
      await apiClient.post("/collaboration/notifications/read-all/", {}),
    ),
  mentions: async () =>
    unwrap<any>(
      await apiClient.get(
        "/collaboration/mentions/?assigned_to_me=true&active=true",
      ),
    ),
  targetMentions: async (resourceType: string, targetId: string) =>
    unwrap<any>(
      await apiClient.get(
        `/collaboration/mentions/?resource_type=${encodeURIComponent(resourceType)}&target_id=${encodeURIComponent(targetId)}&active=true`,
      ),
    ),
  resolve: async (id: string) =>
    unwrap<Mention>(
      await apiClient.post(`/collaboration/mentions/${id}/resolve/`, {}),
    ),
  untag: async (id: string) =>
    unwrap<Mention>(
      await apiClient.post(`/collaboration/mentions/${id}/untag/`, {}),
    ),
  users: async (q = "") =>
    unwrap<EligibleUser[]>(
      await apiClient.get(
        `/collaboration/eligible-users/?q=${encodeURIComponent(q)}`,
      ),
    ),
  tag: async (payload: {
    resource_type: string;
    target_id: string;
    tagged_user: string;
    message?: string;
  }) =>
    unwrap<Mention>(await apiClient.post("/collaboration/mentions/", payload)),
};
