// frontend/src/types/auth.ts
/** Cookie-authenticated user and response contracts. */

export type RoleName = "Administrator" | "Assistant" | "Director";

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  is_staff: boolean;
  is_superuser: boolean;
  is_active: boolean;
  date_joined: string | null;
  last_login: string | null;
  roles: RoleName[];
  permissions: string[];
  avatar_url?: string;
  must_change_password: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
  remember_me?: boolean;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  data: { user: User };
}

export interface SessionResponse {
  success: boolean;
  message: string;
  data: Record<string, never>;
}

export interface MeResponse {
  success: boolean;
  message: string;
  data: { user: User };
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  message: string;
}

export interface ApiError {
  success: false;
  message: string;
  errors: Record<string, string[]>;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
