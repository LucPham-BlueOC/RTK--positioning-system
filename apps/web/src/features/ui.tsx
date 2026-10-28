import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Device colours used on cards, map, scatter plot and chart. */
export const DEVICE_COLORS = ['#38bdf8', '#fbbf24'] as const;

export function Card({
  title,
  children,
  className = '',
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-800 ${className}`}>
      {title && (
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-300 uppercase">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-sky-500 text-slate-950 hover:bg-sky-400',
    secondary: 'bg-slate-800 text-slate-100 hover:bg-slate-700',
    danger: 'bg-rose-600 text-white hover:bg-rose-500',
  }[variant];
  return (
    <button
      className={`min-h-11 rounded-xl px-4 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-800/60 p-3" title={hint}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="tabular text-lg font-semibold">{value}</div>
    </div>
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: 'warn' | 'error' | 'info';
  children: ReactNode;
}) {
  const styles = {
    warn: 'bg-amber-500/15 text-amber-200 ring-amber-500/40',
    error: 'bg-rose-500/15 text-rose-200 ring-rose-500/40',
    info: 'bg-sky-500/15 text-sky-200 ring-sky-500/40',
  }[tone];
  return (
    <div className={`rounded-xl p-3 text-sm ring-1 ${styles}`} role="status">
      {children}
    </div>
  );
}
