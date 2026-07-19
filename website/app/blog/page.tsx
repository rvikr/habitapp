import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Footer from "@/components/ui/footer";
import MarketingNav from "@/components/ui/marketing-nav";
import { Eyebrow } from "@/components/ui/section";
import { JsonLd } from "@/components/seo/json-ld";
import { getAllPosts } from "@/lib/blog";
import { breadcrumbJsonLd } from "@/lib/seo";
import { WEB_APP_URL } from "@/lib/site";

const DESCRIPTION =
  "Guides on building habits that stick — streaks, routines, and what AI coaching can actually do — from the team behind Lagan.";

export const metadata: Metadata = {
  title: "Blog",
  description: DESCRIPTION,
  alternates: {
    canonical: "/blog",
    types: { "application/rss+xml": "/blog/rss.xml" },
  },
  openGraph: {
    title: "Lagan Blog",
    description: DESCRIPTION,
    url: "/blog",
    images: ["/og-image.png"],
  },
};

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function BlogIndexPage() {
  const posts = await getAllPosts();

  return (
    <main className="min-h-screen bg-background text-on-surface">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
        ])}
      />

      <MarketingNav
        actions={
          <Button href={WEB_APP_URL} external variant="primary" size="md">
            Open app
          </Button>
        }
      />

      <div className="mx-auto max-w-6xl px-5 pb-20 pt-[110px] sm:px-8">
        <header className="max-w-3xl space-y-4">
          <Eyebrow>Blog</Eyebrow>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-on-background sm:text-5xl">
            Guides for building habits that stick
          </h1>
          <p className="text-base leading-8 text-on-surface-variant">{DESCRIPTION}</p>
        </header>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {posts.map((post) => (
            <Card key={post.slug} hover className="p-0">
              <Link href={`/blog/${post.slug}`} className="block h-full p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-on-surface-variant/70">
                  {formatDate(post.datePublished)}
                </p>
                <h2 className="mt-3 font-display text-xl font-bold tracking-tight text-on-background">
                  {post.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-on-surface-variant">{post.description}</p>
                <p className="mt-4 flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-outline-variant px-3 py-1 text-xs font-semibold text-on-surface-variant"
                    >
                      {tag}
                    </span>
                  ))}
                </p>
              </Link>
            </Card>
          ))}
        </div>
      </div>

      <Footer />
    </main>
  );
}
