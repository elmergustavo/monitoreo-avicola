/** Barn silhouette with a thermometer: the product mark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <path d="M4 14.5 16 5l12 9.5V27H4V14.5Z" fill="currentColor" opacity="0.14" />
      <path d="M4 14.5 16 5l12 9.5V27H4V14.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 12v8.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="21.5" r="2.6" fill="currentColor" />
    </svg>
  );
}
