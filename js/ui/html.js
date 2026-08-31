const HTML_ESCAPE = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;'
});

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => HTML_ESCAPE[character]);
}

export function escapeAttribute(value = '') {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
