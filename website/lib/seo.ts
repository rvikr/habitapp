import { SITE_URL } from "./site";

/** Stable @id for the Lagan Organization node (declared in app/layout.tsx). */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/** BreadcrumbList for a subpage. Pass the trail from home to the current page. */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.path === "/" ? `${SITE_URL}/` : `${SITE_URL}${item.path}`,
    })),
  };
}

/**
 * FAQPage markup. Keep exactly one FAQPage across the site (currently /faq) —
 * duplicate FAQPage blocks on multiple pages can be treated as spammy markup.
 * The rendered page text must match these answers verbatim.
 */
export function faqPageJsonLd(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

/** BlogPosting markup for a blog article page. */
export function blogPostingJsonLd(post: {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  image?: string;
}) {
  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.datePublished,
    dateModified: post.dateModified ?? post.datePublished,
    image: post.image ?? `${SITE_URL}/og-image.png`,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@id": ORGANIZATION_ID },
    publisher: { "@id": ORGANIZATION_ID },
  };
}
