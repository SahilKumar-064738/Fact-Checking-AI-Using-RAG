import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes without conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number with thousands separators. */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/** Approximate reading-friendly character label, e.g. "1.2k". */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

/** Generate a reasonably unique id without crypto.randomUUID. */
export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}