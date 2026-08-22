const PLAUSIBLE_REMOTE_SCRIPT = /\s*<!-- Privacy-friendly analytics by Plausible -->\s*<script\s+async\s+src=["']https:\/\/plausible\.io\/js\/pa-m_Vcr9SLuhB7IFuIgpvGB\.js["']><\/script>/i;

export function preparePreviewHtml(html){
  return String(html).replace(PLAUSIBLE_REMOTE_SCRIPT, '\n  <!-- Plausible remote tracker intentionally omitted by npm run preview -->');
}
