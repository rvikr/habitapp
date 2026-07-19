import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Footer from "@/components/ui/footer";
import MarketingNav from "@/components/ui/marketing-nav";
import { Eyebrow } from "@/components/ui/section";
import { JsonLd } from "@/components/seo/json-ld";
import { getAllPosts, getPost } from "@/lib/blog";
import { blogPostingJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { PLAY_STORE_URL, SITE_URL, WEB_APP_URL } from "@/lib/site";

// Every post is statically rendered; unknown slugs 404 at build time.
export const dynamicParams = false;

export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

function articleOgImage(title: string): string {
  return `/api/og/card?type=article&title=${encodeURIComponent(title)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: `/blog/${post.slug}`,
      publishedTime: `${post.datePublished}T00:00:00Z`,
      modifiedTime: `${post.dateModified ?? post.datePublished}T00:00:00Z`,
      images: [articleOgImage(post.title)],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [articleOgImage(post.title)],
    },
  };
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = (await getPost(slug))!;
  const { default: Post } = await import(`@/content/blog/${slug}.mdx`);

  return (
    <main className="min-h-screen bg-background text-on-surface">
      <JsonLd
        data={blogPostingJsonLd({
          slug: post.slug,
          title: post.title,
          description: post.description,
          datePublished: post.datePublished,
          dateModified: post.dateModified,
          image: `${SITE_URL}${articleOgImage(post.title)}`,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
          { name: post.title, path: `/blog/${post.slug}` },
        ])}
      />

      <MarketingNav
        actions={
          <Button href={WEB_APP_URL} external variant="primary" size="md">
            Open app
          </Button>
        }
      />

      <article className="mx-auto max-w-6xl px-5 pb-20 pt-[110px] sm:px-8">
        <header className="max-w-3xl space-y-4">
          <p>
            <Link
              href="/blog"
              className="text-sm font-bold text-primary underline-offset-4 transition-colors hover:text-on-background hover:underline"
            >
              ← All posts
            </Link>
          </p>
          <Eyebrow>Guide</Eyebrow>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-on-background sm:text-5xl">
            {post.title}
          </h1>
          <p className="text-sm font-medium text-on-surface-variant/70">
            {formatDate(post.datePublished)}
            {post.tags.length > 0 && <> · {post.tags.join(" · ")}</>}
          </p>
        </header>

        <div className="mt-8 max-w-3xl">
          <Post />
        </div>

        <Card surface="low" className="mt-14 max-w-3xl px-5 py-10 text-center sm:px-8">
          <Eyebrow className="text-tertiary">Put it into practice</Eyebrow>
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-2xl font-bold tracking-tight text-on-background sm:text-3xl">
            Track your first habit with Lagan
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-on-surface-variant">
            Free in the web app, with AI coaching, schedule-aware streaks, and calm reminders.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button href={WEB_APP_URL} external>
              Use the web app
            </Button>
            <Button href={PLAY_STORE_URL} external variant="outline">
              Get it on Google Play
            </Button>
          </div>
        </Card>
      </article>

      <Footer />
    </main>
  );
}
