"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { User, LoginCredentials } from "@/types/auth";
import { apiClient } from "@/lib/api";

/**
 * Authentication hook (M1-A tokenless cookie contract).
 *
 * Sessions live in HttpOnly cookies managed entirely by the server. This
 * hook never sees, holds, or stores a token: login/logout/renewal are plain
 * API calls and the browser attaches the cookies itself.
 */

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) => Promise<void>;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = async () => {
    try {
      setIsLoading(true);
      const me = await apiClient.getMe();
      setUser(me ?? null);
    } catch {
      // 401 (no/expired session) or network failure both mean "signed out"
      // as far as the UI is concerned.
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch current user on mount. This is the authoritative session check:
  // the cookie itself is HttpOnly and invisible to us by design.
  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (mounted) {
        await fetchUser();
      }
    };
    loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (credentials: LoginCredentials) => {
    // The server validates credentials and sets the session cookies on its
    // response; the response body carries only safe user data.
    const loggedInUser = await apiClient.login(
      credentials.email,
      credentials.password,
      credentials.remember_me ?? false,
    );
    setUser(loggedInUser);
  };

  const logout = async () => {
    try {
      await apiClient.logout();
    } catch (error) {
      // Logout must succeed locally even if the server call fails (expired
      // session, offline): the server cleared or will expire its side.
      console.error("Logout error:", error);
    }
    setUser(null);
    queryClient.clear();
    window.location.href = "/login";
  };

  const refreshTokens = async () => {
    await apiClient.refreshSession();
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) => {
    await apiClient.changePassword(
      currentPassword,
      newPassword,
      confirmPassword,
    );
    // The server revokes every outstanding session on password change and
    // clears this client's cookies, so the session is over locally too.
    setUser(null);
    queryClient.clear();
    window.location.href = "/login";
  };

  const refetchUser = async () => {
    await fetchUser();
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    refreshTokens,
    changePassword,
    refetchUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
