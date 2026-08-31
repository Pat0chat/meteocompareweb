const CHARSET_META = /<meta\s+charset=["']utf-8["'][^>]*>/i;

export function injectBaseHref(document, href) {
  const source = String(document ?? '');
  if (!href || /<base\s/i.test(source)) return source;
  return source.replace(CHARSET_META, match => `${match}\n  <base href="${String(href)}" />`);
}
