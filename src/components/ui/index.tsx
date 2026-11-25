import * as React from "react";
import Link from "@/components/nav-link";
import { cn } from "@/lib/utils";

const btn = {
  base: "inline-flex items-center justify-center gap-2 rounded-control text-sm font-medium tracking-[-0.01em] transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
  primary: "bg-brand text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(224_31_37/0.3)] hover:bg-brand-hover",
  secondary: "border border-border bg-surface text-foreground shadow-card hover:bg-background",
  ghost: "text-muted hover:text-foreground hover:bg-background",
  danger: "border border-brand/30 bg-surface text-brand hover:bg-brand-soft",
  md: "h-10 px-4",
  sm: "h-8 px-3 text-[13px]",
};
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export const buttonClass = (variant: ButtonVariant = "primary", size: "md" | "sm" = "md", extra?: string) =>
  cn(btn.base, btn[variant], btn[size], extra);

export function Button({ variant = "primary", size = "md", className, ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "md" | "sm" }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }:
  React.ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: "md" | "sm" }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

const field = "w-full rounded-control border border-border bg-surface px-3 text-sm placeholder:text-muted/70 transition-[border-color,box-shadow] duration-150 focus:border-foreground/30 focus:outline-none focus:ring-4 focus:ring-foreground/5";
export const Input = ({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) => <input className={cn(field, "h-10", className)} {...p} />;
export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cn(field, "py-2 min-h-20", className)} {...p} />;
export const Select = ({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select className={cn(field, "h-10", className)} {...p} />;

export function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-[13px] font-medium text-foreground/80">{label}</span>
      {children}
      {error && <span className="block text-xs text-brand">{error}</span>}
    </label>
  );
}

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) =>
  <div className={cn("rounded-card border border-border bg-surface shadow-card", className)} {...p} />;

const tones = {
  neutral: "bg-background text-muted border border-border",
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-amber-800",
};
export const Badge = ({ tone = "neutral", className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) =>
  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...p} />;

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-prose text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export { Tabs } from "./tabs";
