import { create } from "zustand";
import { persist } from "zustand/middleware";
import axios from "axios";
import type { Role } from "@erp/shared";

const baseURL = (import.meta.env.VITE_API_URL ?? "http://localhost:4000") + "/api";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  refresh: () => Promise<string | null>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      login: async (email, password) => {
        const { data } = await axios.post(`${baseURL}/auth/login`, { email, password });
        set({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
      },

      refresh: async () => {
        const token = get().refreshToken;
        if (!token) return null;
        try {
          const { data } = await axios.post(`${baseURL}/auth/refresh`, { refreshToken: token });
          set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
          return data.accessToken as string;
        } catch {
          set({ user: null, accessToken: null, refreshToken: null });
          return null;
        }
      },

      logout: () => set({ user: null, accessToken: null, refreshToken: null }),

      hasRole: (...roles) => {
        const role = get().user?.role;
        if (!role) return false;
        return role === "ADMIN" || roles.includes(role);
      },
    }),
    { name: "erp-auth" }
  )
);
