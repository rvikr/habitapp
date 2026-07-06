import Link from "next/link";

/** Canonical Lagan brand mark — 4 rounded tiles in ember/amber. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="12" height="12" rx="3" fill="#F26B1F" />
      <rect x="20" y="4" width="12" height="12" rx="3" fill="#FFC56B" opacity="0.75" />
      <rect x="4" y="20" width="12" height="12" rx="3" fill="#FFC56B" opacity="0.5" />
      <rect x="20" y="20" width="12" height="12" rx="3" fill="#F26B1F" opacity="0.8" />
    </svg>
  );
}

/** Mark + wordmark lockup. Wraps in a home link unless `href` is null. */
export function LogoLockup({
  size = 28,
  href = "/",
  className = "",
}: {
  size?: number;
  href?: string | null;
  className?: string;
}) {
  const lockup = (
    <>
      <LogoMark size={size} />
      <span className="font-display text-lg font-bold tracking-tight text-on-background">
        Lagan
      </span>
    </>
  );
  if (href === null) {
    return <span className={`flex items-center gap-2.5 ${className}`}>{lockup}</span>;
  }
  return (
    <Link href={href} aria-label="Lagan home" className={`flex items-center gap-2.5 ${className}`}>
      {lockup}
    </Link>
  );
}
