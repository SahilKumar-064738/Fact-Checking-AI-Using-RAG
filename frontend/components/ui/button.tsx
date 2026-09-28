import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent/90 active:bg-accent/80 disabled:bg-accent/50 shadow-sm",
  secondary:
    "bg-surface-raised text-ink ring-1 ring-inset ring-line hover:bg-surface-sunken disabled:opacity-50",
  ghost: "text-ink-muted hover:bg-surface-sunken hover:text-ink disabled:opacity-50",
  danger: "bg-red-600 text-white hover:bg-red-500 disabled:bg-red-600/50",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-md font-medium",
        "transition-colors duration-150 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
});