import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost";
type Size = "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-white shadow-cta hover:bg-[#D95C18] focus-visible:ring-4 focus-visible:ring-primary/25",
  outline:
    "border border-outline-variant text-on-surface hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-4 focus-visible:ring-primary/15",
  ghost:
    "text-on-surface-variant hover:text-on-background hover:bg-surface-container-high focus-visible:ring-4 focus-visible:ring-primary/15",
};

const SIZES: Record<Size, string> = {
  md: "min-h-11 px-4 py-2.5 text-sm",
  lg: "min-h-12 px-5 py-3 text-base",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "lg", extra = "") {
  return [
    "btn-press inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-bold transition focus:outline-none",
    VARIANTS[variant],
    SIZES[size],
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

type ButtonAsLink = CommonProps & { href: string; external?: boolean } & Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    "href" | "className"
  >;
type ButtonAsButton = CommonProps & { href?: undefined; external?: undefined } & Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "className"
  >;

/**
 * Brand button. Renders a Next `<Link>` for internal `href`s, a plain `<a>`
 * when `external` is set, and a `<button>` otherwise. Labels and hrefs always
 * come from the caller (the landing content test scans page source for them).
 */
function restProps(props: ButtonAsLink | ButtonAsButton) {
  const rest: Record<string, unknown> = { ...props };
  for (const key of ["variant", "size", "className", "children", "href", "external"]) {
    delete rest[key];
  }
  return rest;
}

export function Button(props: ButtonAsLink | ButtonAsButton) {
  const { variant = "primary", size = "lg", className = "", children } = props;
  const classes = buttonClasses(variant, size, className);
  const rest = restProps(props);

  if (props.href !== undefined) {
    if (props.external) {
      return (
        <a href={props.href} className={classes} {...rest}>
          {children}
        </a>
      );
    }
    return (
      <Link href={props.href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
