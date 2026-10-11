export function Logo({ className = 'size-9' }: { className?: string }) {
  return (
    <div className={`${className} grid place-items-center rounded-md bg-primary/20 text-primary-soft`} aria-hidden>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="6" cy="6" r="2.2" />
        <circle cx="18" cy="6" r="2.2" />
        <circle cx="12" cy="18" r="2.2" />
        <path d="M7.8 7.4 10.6 16M16.2 7.4 13.4 16M8.2 6h7.6" />
      </svg>
    </div>
  );
}
