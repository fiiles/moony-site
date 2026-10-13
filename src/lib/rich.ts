export interface RichLink { href: string; hreflang?: string }

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Turns a dictionary string into HTML for `set:html`. The markup is deliberately tiny:
 * `**bold**` for a label in the app's interface, `` `code` ``, and `[text](target)` where the target is
 * an https address or a key of `links` (for site-relative pages, whose address depends on the locale).
 * Everything else is escaped, and an unknown link target throws like a missing dictionary key.
 */
export function rich(text: string, links: Record<string, RichLink> = {}): string {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, target: string) => {
      const link = links[target] ?? (/^https:\/\/[^\s"<>]+$/.test(target) ? { href: target } : undefined);
      if (!link) throw new Error(`rich: unknown link target "${target}" in "${text}"`);
      const lang = link.hreflang ? ` hreflang="${link.hreflang}"` : '';
      return `<a class="link" href="${link.href}"${lang}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
