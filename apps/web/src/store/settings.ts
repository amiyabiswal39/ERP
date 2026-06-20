import { create } from "zustand";
import { api } from "@/lib/api";
import { setBaseCurrency } from "@/lib/utils";

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  isBase: boolean;
}

interface SettingsState {
  currencies: Currency[];
  baseCurrency: string;
  loaded: boolean;
  load: () => Promise<void>;
  setBase: (code: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  currencies: [],
  baseCurrency: "USD",
  loaded: false,

  load: async () => {
    const { data } = await api.get<Currency[]>("/finance/currencies");
    const base = data.find((c) => c.isBase)?.code ?? "USD";
    setBaseCurrency(base);
    set({ currencies: data, baseCurrency: base, loaded: true });
  },

  // Persist the org base currency (admin only) and apply it app-wide.
  setBase: async (code: string) => {
    await api.patch("/finance/base-currency", { code });
    setBaseCurrency(code);
    set((s) => ({
      baseCurrency: code,
      currencies: s.currencies.map((c) => ({ ...c, isBase: c.code === code })),
    }));
  },
}));
