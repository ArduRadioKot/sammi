export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <rect x="2.5" y="2.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="2.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="2.5" y="13.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="13.5" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  );
}
