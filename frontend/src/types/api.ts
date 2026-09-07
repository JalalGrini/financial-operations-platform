export interface HealthResponse {
  service: string;
  version: string;
}

export interface DatabaseHealthResponse {
  database: "healthy" | "unhealthy";
}

export interface ApiError {
  success: false;
  message: string;
  errors: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
