/** MediSnap's mark: a lens with one point on its ring, echoing the landing page's orbit. */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" fill="none">
      <circle cx="20" cy="20" r="20" fill="var(--primary)" />
      <circle cx="20" cy="20" r="11" stroke="#ffffff" strokeWidth="2.5" />
      <path d="M20 15.5v9M15.5 20h9" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="28" cy="12" r="4" fill="var(--coral)" stroke="var(--primary)" strokeWidth="1.5" />
    </svg>
  );
}

export function Logo({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-2.5">
      <LogoMark />
      <span
        translate="no"
        className={`display text-xl ${onDark ? "text-white" : "text-foreground"}`}
      >
        MediSnap
      </span>
    </span>
  );
}
