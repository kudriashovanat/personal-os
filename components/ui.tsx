"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";

export function Card({ className, children, strong }: { className?: string; children: React.ReactNode; strong?: boolean }) {
  return <div className={cn(strong ? "glass-strong" : "glass", "p-5", className)}>{children}</div>;
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
      </div>
      {action}
    </div>
  );
}

export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "soft" | "ghost" | "danger" }>(
  function Button({ className, variant = "primary", ...props }, ref) {
    const styles = {
      primary: "bg-iris text-white hover:bg-iris-deep shadow-card",
      soft: "bg-iris-soft text-iris-deep hover:bg-[#dcd6f8]",
      ghost: "bg-transparent text-soft hover:bg-white/70 hover:text-ink",
      danger: "bg-rose-soft text-rose hover:bg-[#f3d2de]",
    }[variant];
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris",
          styles,
          className
        )}
        {...props}
      />
    );
  }
);

export function Chip({ className, children, onClick, active }: { className?: string; children: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
        active === undefined ? "" : active ? "bg-ink text-white" : "bg-white/70 text-soft hover:text-ink",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold", className)}>{children}</span>;
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-xl border border-line bg-white/80 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-soft/60",
        "focus:border-iris focus:ring-2 focus:ring-iris-soft",
        className
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-xl border border-line bg-white/80 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-soft/60",
        "focus:border-iris focus:ring-2 focus:ring-iris-soft",
        className
      )}
      {...props}
    />
  );
});

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "rounded-xl border border-line bg-white/80 px-3 py-2.5 text-sm outline-none transition focus:border-iris focus:ring-2 focus:ring-iris-soft",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-line", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-iris to-sky transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris",
        checked ? "border-iris bg-iris text-white" : "border-line bg-white hover:border-iris"
      )}
    >
      {checked && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M2 6.5L4.7 9L10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

export function Empty({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      {icon && <div className="text-soft/60">{icon}</div>}
      <div className="font-display text-lg font-medium">{title}</div>
      {hint && <div className="max-w-sm text-sm text-soft">{hint}</div>}
    </div>
  );
}
