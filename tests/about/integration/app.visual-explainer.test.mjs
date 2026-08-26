import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeI18n, hasTranslation } from '../../../js/i18n.js';

const read=file=>fs.readFileSync(new URL(`../../../${file}`,import.meta.url),'utf8');
const app=read('js/app.js'),css=read('styles.css');

assert.match(app,/about-visual-page/,'About must use the visual explainer layout');
assert.match(app,/assets\/icon\.png/,'the multi-model hub must use the real MeteoCompare application logo');
assert.doesNotMatch(app,/about-visual-brand/,'About hero must not repeat the MeteoCompare brand already present in the application shell');
assert.doesNotMatch(app,/aboutVisualEyebrow/,'About hero must not render a redundant eyebrow above its title');
for(const step of [1,2,3,4,5,6]) assert.match(app,new RegExp(`about-visual-step-number\\">${step}<`),`About visual step ${step} missing`);
assert.match(app,/about-visual-engine-grid/,'About must explain the four variable calculation modes visually');
for(const engine of ['MULTI_CONSENSUS','CALIBRATION','SCENARIOS','ADAPTIVE']) assert.match(app,new RegExp(engine),`${engine} must remain represented in About`);
assert.match(app,/aboutVisualEngine\$\{key\}Short/,'engine cards must use dedicated pedagogical copy for every calculation mode');
assert.match(app,/about-visual-consensus-top/,'hierarchical condition consensus must have its own visual hierarchy');
assert.match(app,/about-visual-radar-frames/,'radar observation/projection must be represented visually');
assert.match(app,/about-visual-dashboard/,'decision-support section must use dashboard visuals rather than a person illustration');
assert.doesNotMatch(app,/about-person|about-human-illustration/,'About must not reintroduce a decorative person illustration');
assert.match(app,/about-visual-takeaways/,'About must expose lightweight key takeaways');
const heroIndex=app.indexOf('about-hero about-hero-simple about-visual-hero'),takeawaysIndex=app.indexOf('about-visual-takeaways'),disclaimerIndex=app.indexOf('${renderForecastExpertiseDisclaimer()}'),storyIndex=app.indexOf('about-visual-story about-method');
assert.ok(heroIndex>=0&&takeawaysIndex>heroIndex&&takeawaysIndex<disclaimerIndex&&disclaimerIndex<storyIndex,'key takeaways must sit directly below the About hero, before the disclaimer and detailed story');
assert.doesNotMatch(app,/aboutVisualPracticalTitle|aboutVisualPracticalLead/,'practical cards must flow directly after the explainer without a disruptive section heading');
assert.match(app,/about-community/,'About must include a dedicated community/contact block');
assert.match(app,/meteocompare\.bsky\.social/,'About community block must point to the official MeteoCompare Bluesky account');
assert.match(app,/function blueskyIcon\(size=18\)/,'About community block must render the Bluesky vector inline');
assert.doesNotMatch(app,/🦋|about-install/,'About must not show the emoji placeholder or duplicate installation section');

for(const pref of ['FRENCH','ENGLISH','SPANISH','GERMAN','ITALIAN']){
  for(const key of ['aboutVisualTitle','aboutVisualLead','aboutVisualStepModelsTitle','aboutVisualStepEnginesTitle','aboutVisualEngineAdaptiveShort','aboutVisualStepConditionsTitle','aboutVisualConsensusNote','aboutVisualStepAgreementTitle','aboutVisualStepRadarTitle','aboutVisualRadarHelp','aboutVisualStepDecisionTitle','aboutVisualTakeawayUncertaintyTitle','aboutCommunityTitle','aboutCommunityBody','aboutCommunityAction']) assert.equal(hasTranslation(pref,key),true,`${pref}.${key} missing`);
  for(const removedKey of ['aboutVisualEyebrow','aboutVisualPracticalTitle','aboutVisualPracticalLead']) assert.equal(hasTranslation(pref,removedKey),false,`${pref}.${removedKey} should be removed after layout simplification`);
}
const fr=makeI18n('FRENCH');
assert.equal(fr.t('forecastEngineAdaptive'),'Adaptatif');
assert.match(fr.t('aboutVisualEngineAdaptiveShort'),/combine dynamiquement/i,'Adaptive must be explained as a combination of the other three modes');
assert.doesNotMatch(fr.t('aboutVisualEngineAdaptiveShort'),/apprentissage/i,'Adaptive must not be described as continuous learning');

assert.match(css,/\.about-visual-step\{[^}]*grid-template-columns:[^}]*box-shadow:0 1px 3px rgb\(15 23 42 \/ \.035\)/s,'visual steps must keep a structured composition with a deliberately subtle shadow');
assert.match(css,/\.about-visual-step-copy\{[^}]*box-shadow:none/s,'step copy must not carry an additional shadow');
assert.match(css,/\.about-visual-model-scene\{[^}]*padding-bottom:20px/s,'the multi-model collector must keep breathing room above the scene border');
assert.match(css,/\.about-visual-model-collector\{[^}]*height:68px/s,'the collector geometry must reserve enough height for the square MeteoCompare hub');
assert.match(css,/\.about-visual-model-collector>div\{[^}]*border-radius:13px/s,'the MeteoCompare hub container must be square-rounded to match the square app icon');
assert.match(css,/\.about-visual-engine-grid\{[^}]*repeat\(2/s,'desktop About must use a roomy two-by-two engine grid rather than four cramped columns');
assert.match(css,/\.about-visual-engine\{[^}]*display:grid[^}]*grid-template-columns:42px minmax\(0,1fr\)[^}]*align-items:center[^}]*text-align:left/s,'engine cards must use a compact horizontal icon-and-copy composition');
assert.match(css,/\.about-visual-engine h3\{[^}]*margin:0 0 3px[^}]*text-align:left/s,'engine headings must remain readable and naturally aligned');
assert.doesNotMatch(app,/about-visual-current/,'About engine explainer must not mark one pedagogical mode as selected');
assert.match(css,/\.about-visual-variable-row\{[^}]*repeat\(3/s,'desktop variable list must use three wider columns to keep labels readable');
assert.match(css,/\.about-visual-variable-row strong\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/s,'variable labels must stay on one line without overflowing');
assert.match(css,/\.about-visual-radar-frames\{[^}]*repeat\(5/s,'radar explainer must show observation plus the four projection horizons');
assert.match(css,/@media\(max-width:640px\)[\s\S]*?\.about-visual-engine-grid\{grid-template-columns:1fr 1fr\}/,'About visual engine layout must remain two columns on standard mobile widths');
assert.match(css,/@media\(max-width:420px\)\{\.about-visual-engine-grid\{grid-template-columns:1fr\}/,'very narrow screens must stack engine cards into one column');

console.log('Visual pedagogical About page polish and five-language contract: OK');
