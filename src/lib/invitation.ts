export function invitationToken(value: string): string | null {
  const trimmed = value.trim();
  if (/^[a-f0-9]{64}$/.test(trimmed)) return trimmed;
  if (trimmed.length > 2048) return null;
  try {
    const link = new URL(trimmed);
    if (
      !["https:", "http:"].includes(link.protocol) ||
      link.pathname !== "/convite"
    )
      return null;
    const token = link.hash.slice(1);
    return /^[a-f0-9]{64}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

export function invitationLink(origin: string, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Convite inválido.");
  // Fragments aren't sent in HTTP requests or referrer headers.
  return `${new URL(origin).origin}/convite#${token}`;
}
