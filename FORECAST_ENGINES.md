# MeteoCompare Forecast Engines

MeteoCompare computes quantitative central forecasts with four interchangeable post-processing engines. The raw source-model forecasts and the model-convergence indicators remain separate: changing the selected engine changes synthesized continuous/quantitative variables, not the measured agreement between the underlying models. Weather conditions follow a separate categorical consensus path described below.

## Engines

### Multi-consensus

Default and always-available baseline. Models are balanced by independent numerical-model family, then combined with a robust weighted estimator. Values far from the family-balanced centre are progressively downweighted rather than deleted. Optional local reliability weights are bounded before entering this calculation.

### Calibration

Uses the local verification history already collected by MeteoCompare. For a verified variable, a measured local bias is corrected before aggregation and historical skill can slightly adjust model influence. Calibration profiles are horizon-specific: D+1, D+2, … up to D+7 when the source model exposes that lead time. A missing or immature horizon never borrows the D+1 correction; it falls back to Multi-consensus. Legacy archive rows without a lead-time field are interpreted as D+1 only.

The 1.17.14 safety audit keeps this deliberately conservative:

- a model still needs at least 14 valid observations before it can contribute calibrated information;
- at 14 samples the measured bias is only partially corrected; calibration strength grows progressively and reaches full strength at 30 samples;
- calibration coverage is measured with family-balanced mass, not raw model count;
- at least two independent calibrated model families are required;
- at least 34% of the currently usable family-balanced mass must be calibratable;
- residual historical error widens the descriptive engine interval.

If these conditions are not met, the engine falls back to Multi-consensus and exposes the fallback in the comparison view.

Precipitation is handled in two separate parts: occurrence probability and amount conditional on rain. Historical wet-day frequency can adjust occurrence probability only when the same independent-family safeguards are met. Amount calibration uses a dedicated error profile built only from historical hits where both the model forecast and the observation are wet; the generic all-day precipitation bias is never applied to conditional wet-event amount. A calibrated conditional amount is also bounded strictly above the wet threshold so a non-zero rain probability cannot be paired with an internally 'wet' amount of 0 mm.

The current local verification archive validates daily maximum temperature, daily precipitation total and daily maximum wind. Calibration is therefore applied only to forecast quantities with a matching verified target. Hourly/current temperature and wind, daily minimum temperature, gusts and cloud cover transparently fall back to the robust engine until dedicated verification series exist.

### Scenarios

Looks for a statistically meaningful split in the family-balanced one-dimensional forecast distribution for the variable being synthesized. A split must contain enough weight on both sides and a gap large enough relative to the variable tolerance and current median absolute deviation.

When a meaningful split exists, a cluster must hold at least 55% of the family-balanced weight before it is allowed to provide the central value. A 50/50 or otherwise near-balanced split is explicitly reported as `NO_DOMINANT_SCENARIO` and falls back to Multi-consensus while preserving both scenarios for diagnostics. When no meaningful split exists at all, the engine reports a `SINGLE_SCENARIO` fallback.

This is intentionally a lightweight local scalar clustering mechanism. It is not equivalent to synoptic-flow clustering of complete ensemble weather fields.

### Adaptive

Runs Multi-consensus, Calibration and Scenarios on the same input. A strong multimodal split selects Scenarios. Otherwise, sufficiently covered calibration is blended conservatively with the robust baseline. The trust given to calibration depends on independent-family coverage, calibration maturity and historical skill and is capped so the robust baseline remains represented. If neither route is sufficiently supported, Adaptive uses Multi-consensus.

The effective engine is always exposed so the decision remains inspectable.

## Variables and convergence

The selected forecast engine is applied to continuous or quantitative forecast quantities where numeric aggregation/post-processing is meaningful: temperature, precipitation occurrence/amount, wind, gusts and cloud cover.

Weather-condition codes deliberately do **not** pass through Calibration, Scenarios or Adaptive. They use the shared `weatherConditionConsensus()` hierarchy in every synthesized view. Model lineages are family-balanced first; the resolver then selects `DRY` vs `PRECIPITATION`, then a semantic family (`SKY`, `FOG`, `LIQUID`, `SNOW`, `FREEZING`, `THUNDER`), and finally an ordered subtype where appropriate. Severity is reserved for genuine ties between distinct meteorological families rather than adjacent sky/rain/snow variants.

This means changing the selected quantitative forecast engine may change temperatures, rain amounts/probabilities, wind or cloud cover, while the central weather-condition label remains the same hierarchical multi-model consensus for the same source-model inputs.

A central audit correction, strengthened in 1.17.14, separates two concepts everywhere:

1. **source-model agreement** — calculated only from raw comparable model values and family balancing;
2. **central forecast** — calculated by the selected forecast engine.

Hourly agreement bands, timeline convergence, daily confidence and cloud agreement therefore no longer inherit an engine-specific convergence score. A change from Multi-consensus to Calibration or Scenarios can move the forecast value without artificially making the raw models appear more or less convergent.

Rain occurrence has an additional rule: **event probability and model agreement are different quantities**. The probability is the family-balanced mean PoP (or a deterministic wet/dry fallback when a model has no native PoP). Occurrence convergence is derived from the family-balanced dispersion of those probabilities. Thus three models at 50% PoP have high agreement about an uncertain event, while probabilities of 100%, 60% and 80% have lower agreement even though their mean is also 80%.

The daily convergence score now has one shared contract in every view. It averages the available raw-source agreement components for temperature, precipitation, wind and categorical condition; the same result is reused by the daily summary and the daily timeline. With one independent family, a central estimate can still be shown but convergence remains unavailable. With two families, convergence is computed but explicitly marked as a limited comparison.

## Input quality and missing-data policy

Before consensus, forecast values pass through broad physical plausibility guards. Impossible temperatures, precipitation amounts/probabilities, cloud cover, wind/gust values, directions and WMO codes become missing values instead of entering the statistics. A daily `Tmax < Tmin` pair is rejected as internally inconsistent. The same guards are reapplied when aggregating older locally cached forecasts, so stale pre-1.17.14 data cannot bypass the safety layer.

Missing hourly slots are never interpolated implicitly for current conditions or consensus. If a model does not contain the exact civil-hour slot being analysed, that model is absent for that slot. Series health also records internal gaps and flags long fragmented runs. This favours an explicit smaller sample over a fabricated continuous trajectory.

Weather-condition fallback now estimates the temperature during precipitation from precipitation-weighted hourly temperatures. Daily minimum temperature is not used as a proxy for the precipitation phase, preventing a cold dawn from turning a warm-afternoon rain episode into snow when native condition codes are unavailable.

## Intervals and uncertainty

Engine intervals are **descriptive spread intervals**, not calibrated probability intervals. They combine weighted quantiles with a dispersion envelope so source spread remains visible. The UI and documentation must not describe them as an 80%, 90% or other probabilistic confidence interval until a separately verified probabilistic calibration pipeline exists.

Calibration exposes two uncertainty components: current inter-model dispersion and residual historical calibration error. Adaptive propagates both when it blends a calibrated estimate with the robust baseline, combining them quadratically instead of silently dropping historical residual error.

When Scenarios detects a dominant cluster, two ranges are retained: `scenarioInterval` describes the main cluster while `allSourceInterval` describes the spread across every source family. The comparison UI labels both when they differ, so a tight dominant scenario cannot hide a substantial minority scenario.

Precipitation keeps occurrence and intensity separate. `conditionalAmountMm` answers “how much if it rains”, while the quantitative central amount is the continuous expected amount `P(wet) × amount-if-wet`; there is no jump at 50% PoP. Precipitation intervals are expressed on that same expected-amount scale. Their uncertainty propagates both PoP dispersion and conditional-amount uncertainty, while conditional intervals remain available separately for diagnostics.

Pedagogical diagnostics therefore expose distinct concepts rather than collapsing them into one confidence number: rain probability, model agreement, source dispersion, historical reliability and evidence level (standard / limited / single-source).

## User interface

Settings > Forecast lets the user select Multi-consensus, Calibration, Scenarios or Adaptive. The choice is persisted locally.

Home and City Details use the same selected-engine context, including optional local weights and available calibration profiles. Home cards, current conditions, daily summaries, watchlist signals and mini-timelines therefore stay consistent with City Details.

City Details places **Compare engines** between model convergence and weather scenarios. Its modal uses a single full-width seven-day chart with an in-place variable selector for maximum temperature, minimum temperature, expected precipitation, mean wind, gusts and cloud cover. The selector avoids stacking several charts while keeping every variable directly comparable across the four engines. A daily divergence timeline now includes cloud-cover spread alongside temperature, precipitation and wind, and detailed per-day matrices remain available below. The active engine, fallbacks, calibration coverage and detected scenario count are exposed where meaningful.

## Verification limits and next statistical step

The current engine deliberately does **not** claim to implement a trained EMOS or Bayesian Model Averaging system. Operational statistical post-processing normally relies on a representative archive of forecast–observation pairs and evaluates both central error and probabilistic calibration. MeteoCompare's local archive is smaller, browser-local and currently covers only selected daily targets.

The next statistical milestone should therefore be an out-of-sample engine benchmark rather than a more complex formula: rolling holdout evaluation by variable and horizon, MAE/RMSE/bias for central forecasts, Brier score for binary rain occurrence and CRPS/reliability once true predictive distributions are introduced. Training/calibration observations must be separated from the periods used to claim comparative skill.

## Audit invariants

`tests/forecast/unit/forecast-engines.audit.test.mjs` locks the following properties:

- order-invariant results;
- no mutation of caller-owned input rows;
- bounded output intervals;
- sample-size shrinkage of bias correction;
- independent-family calibration requirements;
- explicit single-scenario fallback;
- bounded precipitation probability;
- timeline and hourly agreement invariant to the selected forecast engine.
