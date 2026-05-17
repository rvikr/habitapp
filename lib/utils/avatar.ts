export const AVATAR_STYLES = [
  { id: "avataaars", label: "Avataaars" },
  { id: "lorelei", label: "Lorelei" },
  { id: "notionists", label: "Notionists" },
  { id: "personas", label: "Personas" },
  { id: "thumbs", label: "Thumbs" },
  { id: "fun-emoji", label: "Fun emoji" },
] as const;

export type AvatarStyle = (typeof AVATAR_STYLES)[number]["id"];

export const AVATAR_SEED_PRESETS = [
  "Aspen",
  "Brooks",
  "Cleo",
  "Dax",
  "Ellis",
  "Fern",
  "Gus",
  "Hollis",
  "Indra",
  "Juno",
  "Kit",
  "Lyra",
];

export function avatarUrl(style?: AvatarStyle | null, seed?: string | null) {
  const s = style || "avataaars";
  const sd = seed || "Aspen";
  const params = new URLSearchParams({
    seed: sd,
    backgroundColor: "e6deff,d8ceff,c9c4d7,73f3ef,ffdbce",
    radius: "50",
    size: "256",
  });
  // PNG (not SVG) so React Native's <Image> can render it on every platform.
  return `https://api.dicebear.com/9.x/${s}/png?${params.toString()}`;
}

export function avatarFromUser(user: {
  id?: string | null;
  user_metadata?: Record<string, unknown> | null;
  email?: string | null;
}) {
  const meta = user.user_metadata ?? {};
  const style = (meta.avatar_style as AvatarStyle | undefined) ?? "avataaars";
  const seed = (meta.avatar_seed as string | undefined) ?? user.id?.slice(0, 12) ?? "Aspen";
  return avatarUrl(style, seed);
}
