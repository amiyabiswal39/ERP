import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Organization base/display currency — drives every module's money formatting.
// Set once at app load (and when the super-user changes it) so all existing
// formatCurrency(x) calls reformat without per-call-site changes.
let baseCurrencyCode = "USD";
export function setBaseCurrency(code: string) {
  if (code) baseCurrencyCode = code;
}
export function getBaseCurrency() {
  return baseCurrencyCode;
}

export function formatCurrency(value: number, currency?: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? baseCurrencyCode,
  }).format(value || 0);
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
