export function preparePreviewHtml(html){
  // Analytics loading is host-gated in index.html, so localhost never creates the Plausible script.
  return String(html);
}
