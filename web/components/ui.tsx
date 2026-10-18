/** Small shared primitives: buttons, chips, cards, spinner, verdict + XP chips. */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Verdict } from "@/lib/contracts/moment";

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

type ButtonVariant = "primary" | "secondary" | "quiet";

const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-soft hover:brightness-110 disabled:opacity-50",
  secondary: "bg-surface text-text border border-border hover:bg-surface-2 disabled:opacity-50",
  quiet: "text-muted underline-offset-4 hover:text-text hover:underline disabled:opacity-50",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  const pad = variant === "quiet" ? "px-1 py-1" : size === "sm" ? "px-3 py-1.5" : "px-5 py-2.5";
  const text = size === "sm" || variant === "quiet" ? "text-sm" : "text-base";
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:cursor-not-allowed ${pad} ${text} ${BUTTON[variant]} ${focusRing} ${className}`}
      {...rest}
    />
  );
}

/** Pill button. Pass `selected` to make it a toggle (aria-pressed); omit it for a plain action chip. */
export function Chip({
  selected,
  role,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  const state = selected === undefined ? {} : role === "radio" ? { "aria-checked": selected } : { "aria-pressed": selected };
  return (
    <button
      type="button"
      role={role}
      {...state}
      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${focusRing} ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-surface text-text hover:bg-surface-2"
      } ${className}`}
      {...rest}
    />
  );
}

export function Card({ children, className = "", as: Tag = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`rounded-card border border-border bg-surface p-5 shadow-soft sm:p-6 ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function Spinner({ label = "Loading", className = "" }: { label?: string; className?: string }) {
  return (
    <span role="status" className={`inline-flex items-center ${className}`}>
      <span
        aria-hidden="true"
        className="h-4 w-4 rounded-full border-2 border-accent border-t-primary motion-safe:animate-spin"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export const VERDICT_LABEL: Record<Verdict, string> = { correct: "Nice!", partial: "Partly", incorrect: "Not quite" };

const VERDICT_TONE: Record<Verdict, string> = {
  correct: "text-success",
  partial: "text-primary",
  incorrect: "text-gentle-error",
};

/** Colored text always sits on bg-surface so it meets AA contrast in every theme. */
export function VerdictChip({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`inline-flex items-center rounded-full bg-surface px-3 py-1 text-sm font-bold ${VERDICT_TONE[verdict]}`}>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

export function XpChip({ amount }: { amount: number }) {
  if (amount <= 0) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-surface px-3 py-1 text-sm font-bold text-primary">
      +{amount} XP
    </span>
  );
}

export function PadlockIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="currentColor">
      <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 4 15h8a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 12 6h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z" />
    </svg>
  );
}
