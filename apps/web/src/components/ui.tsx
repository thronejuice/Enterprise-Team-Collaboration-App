import { ButtonHTMLAttributes, forwardRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover disabled:hover:bg-primary',
  secondary: 'bg-surface text-fg border border-line hover:bg-surface-3',
  danger: 'bg-danger text-white font-semibold hover:bg-danger-hover',
  ghost: 'text-fg-muted hover:bg-surface hover:text-fg',
};

const sizes = { sm: 'h-8 px-2.5 text-[13px]', md: 'h-9 px-3', lg: 'h-11 px-4 text-[15px]' };

/** Button styling for elements that must stay links (navigation, downloads). */
export function buttonClass(variant: Variant = 'primary', size: keyof typeof sizes = 'md', className?: string): string {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    sizes[size],
    variants[variant],
    className,
  );
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: 'sm' | 'md' | 'lg' }
>(function Button({ variant = 'primary', loading, size = 'md', className, children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={buttonClass(variant, size, className)}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cx(
        'h-9 w-full rounded border border-line bg-canvas px-3 text-fg placeholder:text-placeholder transition-colors focus:border-primary focus:outline-none',
        className,
      )}
      {...props}
    />
  );
});

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx('h-9 w-full rounded border border-line bg-canvas px-2.5 text-fg focus:border-primary focus:outline-none', className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium tracking-[0.015em] text-fg-subtle">
      {children}
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('rounded-lg border border-line/60 bg-surface', className)}>{children}</section>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-1 text-fg-subtle">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Pill({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'primary'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'border-line-strong text-fg-muted bg-surface-3/40',
    success: 'border-success/60 text-success bg-success/10',
    danger: 'border-danger text-danger bg-danger/15',
    warning: 'border-warning/60 text-warning bg-warning/10',
    info: 'border-cyan/60 text-cyan bg-cyan/10',
    primary: 'border-primary/60 text-primary-soft bg-primary/15',
  };
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-[14px] font-semibold tracking-[0.03em] uppercase', tones[tone], className)}>
      {children}
    </span>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-2 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-red-200">
      {children}
    </p>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-fg-subtle" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label ?? 'Loading…'}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 text-fg-subtle">{icon}</div>
      <p className="font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-sm text-fg-subtle">{children}</p>}
    </div>
  );
}
