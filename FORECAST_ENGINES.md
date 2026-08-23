# MeteoCompare Forecast Engines

MeteoCompare 1.16.0 computes the central forecast with four interchangeable post-processing engines. The raw source-model forecasts and the model-convergence indicators remain separate: changing the selected engine changes the synthesized forecast, not the measured agreement between the underlying models.

## Engines

### Multi-consensus

Default and always-available baseline. Models are balanced by independent numerical-model family, then combined with a robust weighted estimator. Values far from the family-balanced centre are progressively downweighted rather than deleted. Optional local reliability weights are bounded before entering this calculation.

### Calibration

Uses the local verification history already collected by MeteoCompare. For a verified variable, a measured local bias is corrected before aggregation and historical skill can slightly adjust model influence.

The 1.16.0 audit makes this deliberately conservative:

- a model still needs at least 14 valid observations before it can contribute calibrated information;
- at 14 samples the measured bias is only partially corrected; calibration strength grows progressively and reaches full strength at 30 samples;
- calibration coverage is measured with family-balanced mass, not raw model count;
- at least two independent calibrated model families are required;
- at least 34% of the currently usable family-balanced mass must be calibratable;
- residual historical error widens the descriptive engine interval.

If these conditions are not met, the engine falls back to Multi-consensus and exposes the fallback in the comparison view.

Precipitation is handled in two parts: occurrence probability and amount conditional on rain. Historical wet-day frequency can adjust occurrence probability only when the same independent-family safeguards are met. Amount calibration is applied once to the conditional amount calculation.

The current local verification archive validates daily maximum temperature, daily precipitation total and daily maximum wind. Calibration is therefore applied only to forecast quantities with a matching verified target. Hourly/current temperature and wind, daily minimum temperature, gusts and cloud cover transparently fall back to the robust engine until dedicated verification series exist.

### Scenarios

Looks for a statistically meaningful split in the family-balanced one-dimensional forecast distribution for the variable being synthesized. A split must contain enough weight on both sides and a gap large enough relative to the variable tolerance and current median absolute deviation.

When a meaningful split exists, the dominant cluster provides the central value instead of averaging two incompatible groups. When no meaningful split exists, the engine explicitly reports a `SINGLE_SCENARIO` fallback to Multi-consensus rather than presenting the robust result as if scenario selection had occurred.

This is intentionally a lightweight local scalar clustering mechanism. It is not equivalent to synoptic-flow clustering of complete ensemble weather fields.

### Adaptive

Runs Multi-consensus, Calibration and Scenarios on the same input. A strong multimodal split selects Scenarios. Otherwise, sufficiently covered calibration is blended conservatively with the robust baseline. The trust given to calibration depends on independent-family coverage, calibration maturity and historical skill and is capped so the robust baseline remains represented. If neither route is sufficiently supported, Adaptive uses Multi-consensus.

The effective engine is always exposed so the decision remains inspectable.

## Variables and convergence

The forecast engine is applied to continuous forecast quantities where an aggregation is meaningful. Weather-condition codes remain a categorical family-balanced vote because a numeric bias correction is not meaningful for WMO condition classes.

A central audit correction in 1.16.0 separates two concepts everywhere:

1. **source-model agreement** — calculated only from raw comparable model values and family balancing;
2. **central forecast** — calculated by the selected forecast engine.

Hourly agreement bands, timeline convergence, daily confidence and cloud agreement therefore no longer inherit an engine-specific convergence score. A change from Multi-consensus to Calibration or Scenarios can move the forecast value without artificially making the raw models appear more or less convergent.

## Intervals

Engine intervals are **descriptive spread intervals**, not calibrated probability intervals. They combine weighted quantiles with a dispersion envelope so source spread remains visible. The UI and documentation must not describe them as an 80%, 90% or other probabilistic confidence interval until a separately verified probabilistic calibration pipeline exists.

## User interface

Settings > Forecast lets the user select Multi-consensus, Calibration, Scenarios or Adaptive. The choice is persisted locally.

Home and City Details use the same selected-engine context, including optional local weights and available calibration profiles. Home cards, current conditions, daily summaries, watchlist signals and mini-timelines therefore stay consistent with City Details.

City Details places **Compare engines** between model convergence and weather scenarios. Its modal uses a single full-width seven-day chart with an in-place variable selector for maximum temperature, minimum temperature, expected precipitation, mean wind, gusts and cloud cover. The selector avoids stacking several charts while keeping every variable directly comparable across the four engines. A daily divergence timeline now includes cloud-cover spread alongside temperature, precipitation and wind, and detailed per-day matrices remain available below. The active engine, fallbacks, calibration coverage and detected scenario count are exposed where meaningful.

## Verification limits and next statistical step

The current engine deliberately does **not** claim to implement a trained EMOS or Bayesian Model Averaging system. Operational statistical post-processing normally relies on a representative archive of forecast–observation pairs and evaluates both central error and probabilistic calibration. MeteoCompare's local archive is smaller, browser-local and currently covers only selected daily targets.

The next statistical milestone should therefore be an out-of-sample engine benchmark rather than a more complex formula: rolling holdout evaluation by variable and horizon, MAE/RMSE/bias for central forecasts, Brier score for binary rain occurrence and CRPS/reliability once true predictive distributions are introduced. Training/calibration observations must be separated from the periods used to claim comparative skill.

## Audit invariants

`tests/forecast-engine-audit-1160.mjs` now locks the following properties:

- order-invariant results;
- no mutation of caller-owned input rows;
- bounded output intervals;
- sample-size shrinkage of bias correction;
- independent-family calibration requirements;
- explicit single-scenario fallback;
- bounded precipitation probability;
- timeline and hourly agreement invariant to the selected forecast engine.
