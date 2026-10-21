export function renderSafeMarkdown(value: string): string {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // A Markdown link, or a plain http(s) address. Quotes and angle brackets are
    // escaped by now, so they end an address, and trailing punctuation stays out.
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|https?:\/\/(?:[^\s&<]|&amp;)*(?:[^\s&<.,:;!?)\]]|&amp;)/g, (match: string, text?: string, href?: string) => `<a href="${href ?? match}" target="_blank" rel="noreferrer noopener">${text ?? match}</a>`)
    .replace(/\n/g, "<br />");
}

