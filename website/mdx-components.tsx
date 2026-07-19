import type { MDXComponents } from "mdx/types";

/**
 * Global MDX element styling (required at the project root by @next/mdx).
 * Matches the marketing site's prose look: display-font headings on
 * on-background, body copy on on-surface-variant.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h2: (props) => (
      <h2
        className="mt-10 font-display text-2xl font-bold tracking-tight text-on-background"
        {...props}
      />
    ),
    h3: (props) => (
      <h3
        className="mt-8 font-display text-xl font-bold tracking-tight text-on-background"
        {...props}
      />
    ),
    p: (props) => <p className="mt-4 text-base leading-7 text-on-surface-variant" {...props} />,
    a: (props) => (
      <a
        className="font-semibold text-on-background underline-offset-4 hover:underline"
        {...props}
      />
    ),
    ul: (props) => (
      <ul
        className="mt-4 list-disc space-y-2 pl-6 text-base leading-7 text-on-surface-variant"
        {...props}
      />
    ),
    ol: (props) => (
      <ol
        className="mt-4 list-decimal space-y-2 pl-6 text-base leading-7 text-on-surface-variant"
        {...props}
      />
    ),
    li: (props) => <li className="pl-1" {...props} />,
    blockquote: (props) => (
      <blockquote
        className="mt-4 border-l-2 border-primary/50 pl-4 text-base italic leading-7 text-on-surface-variant"
        {...props}
      />
    ),
    strong: (props) => <strong className="font-bold text-on-surface" {...props} />,
    ...components,
  };
}
