import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from "axios";

/**
 * Cookie-based API client (M1-A tokenless cookie contract).
 *
 * The backend authenticates exclusively through HttpOnly JWT cookies:
 * tokens never appear in request bodies, response bodies, headers this
 * client builds, or any web-accessible storage. This module therefore:
 *
 * - sends cookies on every request (`withCredentials: true`),
 * - bootstraps and echoes the CSRF token for every unsafe method,
 * - retries a failed request once after a cookie-based session renewal,
 * - never touches client-side token storage (there is nothing to store).
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/v1";

const CSRF_COOKIE_NAME = "csrftoken";
const CSRF_HEADER_NAME = "X-CSRFToken";

/** Methods Django's CSRF middleware treats as safe (no token required). */
const SAFE_METHODS = new Set(["get", "head", "options", "trace"]);

/** Flatten arbitrarily nested DRF serializer errors into readable field paths. */
export function flattenApiErrors(value: unknown, path = ""): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) {
    const containsStructuredItems = value.some(
      (item) => typeof item === "object" && item !== null,
    );
    return value.flatMap((item, index) => {
      const childPath = containsStructuredItems
        ? `${path || "item"}[${index}]`
        : path;
      return flattenApiErrors(item, childPath);
    });
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) => {
        const anonymous = key === "detail" || key === "non_field_errors";
        const childPath = anonymous ? path : path ? `${path}.${key}` : key;
        return flattenApiErrors(child, childPath);
      },
    );
  }
  const text = String(value);
  return [path ? `${path}: ${text}` : text];
}

/** Endpoints that must never trigger the automatic session-renewal retry. */
const AUTH_ENDPOINTS = [
  "/auth/login/",
  "/auth/refresh/",
  "/auth/logout/",
  "/auth/csrf/",
  "/auth/me/",
];

function isPublicAuthLocation(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/companies/") ||
    pathname.startsWith("/tickets") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/security") ||
    pathname.startsWith("/status") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/support") ||
    pathname.startsWith("/docs")
  );
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

class ApiClient {
  private client: AxiosInstance;
  private renewalPromise: Promise<void> | null = null;
  private csrfBootstrapPromise: Promise<void> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
      // Cookies are the credential channel; they must flow on every call.
      withCredentials: true,
    });

    this.setupInterceptors();
  }

  /**
   * Ensure the CSRF cookie exists before the first unsafe request.
   *
   * The backend exposes `GET /auth/csrf/` precisely for this bootstrap;
   * it sets the (JS-readable) CSRF cookie that must be echoed back in the
   * CSRF header on every unsafe request. Single-flighted so a burst of
   * concurrent mutations triggers exactly one bootstrap call.
   */
  private ensureCsrfCookie(): Promise<void> {
    if (readCookie(CSRF_COOKIE_NAME)) {
      return Promise.resolve();
    }
    const existing = this.csrfBootstrapPromise;
    if (existing) {
      return existing;
    }
    // Explicit annotation: no control-flow narrowing needed (mutable class
    // properties are not narrowed at return statements).
    const pending: Promise<void> = axios
      .get(`${API_BASE_URL}/auth/csrf/`, { withCredentials: true })
      .then(() => undefined)
      .finally(() => {
        this.csrfBootstrapPromise = null;
      });
    this.csrfBootstrapPromise = pending;
    return pending;
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        if (config.url) {
          const queryIdx = config.url.indexOf("?");
          const pathPart =
            queryIdx !== -1 ? config.url.slice(0, queryIdx) : config.url;
          const queryPart = queryIdx !== -1 ? config.url.slice(queryIdx) : "";
          if (!pathPart.endsWith("/") && !/\.[a-zA-Z0-9]+$/.test(pathPart)) {
            config.url = `${pathPart}/${queryPart}`;
          }
        }

        const method = (config.method || "get").toLowerCase();
        if (!SAFE_METHODS.has(method)) {
          await this.ensureCsrfCookie();
          const csrfToken = readCookie(CSRF_COOKIE_NAME);
          if (csrfToken && config.headers) {
            config.headers[CSRF_HEADER_NAME] = csrfToken;
          }
        }

        // File uploads must be multipart/form-data with a browser-generated
        // boundary. The default JSON Content-Type would stringify the file
        // and Django would reject it as "not a file".
        if (typeof FormData !== "undefined" && config.data instanceof FormData) {
          const headers = config.headers as
            | { delete?: (name: string) => void }
            | Record<string, unknown>
            | undefined;
          if (headers && typeof headers.delete === "function") {
            headers.delete("Content-Type");
            headers.delete("content-type");
          } else if (headers) {
            delete (headers as Record<string, unknown>)["Content-Type"];
            delete (headers as Record<string, unknown>)["content-type"];
          }
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as
          | (AxiosRequestConfig & { _retry?: boolean })
          | undefined;
        const url = originalRequest?.url || "";
        const isAuthEndpoint = AUTH_ENDPOINTS.some((endpoint) =>
          url.includes(endpoint),
        );

        // On an expired session cookie, renew once via the renewal cookie
        // (sent automatically by the browser) and replay the request once.
        if (
          error.response?.status === 401 &&
          originalRequest &&
          !originalRequest._retry &&
          !isAuthEndpoint
        ) {
          originalRequest._retry = true;
          try {
            await this.renewSession();
          } catch (renewError) {
            // Renewal failed: the session is over. Clear the cookies
            // server-side (they are HttpOnly, so only the server can) so the
            // middleware's cookie-presence check cannot bounce a user with a
            // stale cookie between /login and /dashboard forever. Logout is
            // idempotent and AllowAny, so this is safe to attempt always.
            try {
              await this.logout();
            } catch {
              // Best effort only — local sign-out proceeds regardless.
            }
            if (
              typeof window !== "undefined" &&
              !isPublicAuthLocation(window.location.pathname)
            ) {
              window.location.href = "/login";
            }
            return Promise.reject(renewError);
          }
          return this.client.request(originalRequest);
        }

        // Surface the backend's real validation details. The backend wraps
        // errors as { success: false, message, errors: { field: [messages] } }
        // (config/exceptions.py). Without this, every toast only shows axios'
        // generic "Request failed with status code 400" and the actual cause
        // (e.g. which field failed, overlap rule, duplicate value) is invisible.
        const responseData: any = error.response?.data;
        if (
          responseData &&
          typeof responseData === "object" &&
          !(responseData instanceof Blob)
        ) {
          const errors = responseData.errors ?? responseData;
          const parts = flattenApiErrors(errors);
          const envelopeMessage = responseData.message;
          if (
            envelopeMessage &&
            typeof envelopeMessage === "string" &&
            envelopeMessage !== "An error occurred." &&
            parts.length === 0
          ) {
            parts.push(envelopeMessage);
          }
          if (parts.length > 0) {
            (error as any).message = parts.join(" — ");
          }
        }

        return Promise.reject(error);
      },
    );
  }

  /**
   * Renew the session through the renewal cookie. Single-flighted: parallel
   * 401s share one renewal call instead of racing (the first renewal rotates
   * the token, so a second call with the old cookie would fail).
   */
  private renewSession(): Promise<void> {
    const existing = this.renewalPromise;
    if (existing) {
      return existing;
    }
    const pending: Promise<void> = this.ensureCsrfCookie()
      .then(() => {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const csrfToken = readCookie(CSRF_COOKIE_NAME);
        if (csrfToken) {
          headers[CSRF_HEADER_NAME] = csrfToken;
        }
        // Bare axios: a 401 here must not re-enter this client's
        // response interceptor (that would recurse forever).
        return axios.post(
          `${API_BASE_URL}/auth/refresh/`,
          {},
          {
            withCredentials: true,
            headers,
          },
        );
      })
      .then(() => undefined)
      .finally(() => {
        this.renewalPromise = null;
      });
    this.renewalPromise = pending;
    return pending;
  }

  /**
   * Public session renewal, used by the auth hook's refreshTokens().
   * Cookie-only: takes no token argument and returns no token value.
   */
  async refreshSession(): Promise<void> {
    return this.renewSession();
  }

  async login(email: string, password: string, rememberMe = false) {
    const response = await this.client.post("/auth/login/", {
      email,
      password,
      remember_me: rememberMe,
    });
    // The response carries only safe user data; the credentials live in
    // HttpOnly cookies the server just set. There is nothing to store here.
    return response.data.data.user;
  }

  async logout(): Promise<void> {
    // Cookie-only: the server reads the session from its cookies and clears
    // them on its response. The request body is intentionally empty.
    await this.client.post("/auth/logout/", {});
  }

  async getMe() {
    const response = await this.client.get("/auth/me/");
    return response.data.data.user;
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) {
    const response = await this.client.post("/auth/change-password/", {
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    });
    return response.data;
  }

  async healthCheck() {
    const response = await this.client.get("/health/");
    return response.data;
  }

  async databaseHealthCheck() {
    const response = await this.client.get("/health/database/");
    return response.data;
  }

  async get<T>(url: string, config?: AxiosRequestConfig) {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig) {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}

export const apiClient = new ApiClient();
