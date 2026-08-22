# MeteoCompare Forecast Engines V3

MeteoCompare 1.15.0 can compute the central forecast with four interchangeable engines. The raw model forecasts and the model-convergence indicators remain unchanged: engines only change how the central forecast and its engine interval are derived.

## Engines

### Multi-consensus

Default and always-available baseline. Models are balanced by independent model family, then combined with a robust weighted estimator. Values far from the family-balanced centre are progressively downweighted rather than deleted. Optional local reliability weights are bounded before entering this calculation.

### Calibration

Uses the local verification history already collected by MeteoCompare. Per model and variable, a local mean bias is removed and historical skill slightly adjusts the model weight. Historical residual spread widens the engine interval. A model needs at least 14 valid observations. If fewer than two models, or less than 34% of the currently usable models, can be calibrated, the engine falls back to Multi-consensus and exposes that fallback in the comparison view.

Precipitation is handled in two parts: occurrence probability and amount conditional on rain. Historical wet-day frequency can adjust occurrence probability; the amount calibration is applied once to the conditional amount calculation.

The current local verification archive validates daily maximum temperature, daily precipitation total and daily maximum wind. Calibration is therefore applied only to forecast quantities with a matching verified target. Hourly/current temperature and wind, daily minimum temperature, gusts and cloud cover transparently fall back to the robust engine until dedicated verification series exist; the comparison modal exposes that fallback instead of applying an invalid bias correction.

### Scenarios

Looks for a statistically meaningful split in the family-balanced one-dimensional forecast distribution. A split must contain enough weight on both sides and a gap large enough relative to the variable's normal tolerance and current median absolute deviation. When a dominant scenario exists, its central value is used instead of averaging incompatible clusters. The engine exposes scenario count, shares, central values and ranges.

### Adaptive

Runs Multi-consensus, Calibration and Scenarios on the same input. A strong multimodal split selects Scenarios. Otherwise, sufficiently covered and reasonably skilled calibration is blended with the robust baseline. If neither condition is met, it uses Multi-consensus. The effective engine is always exposed so the decision is inspectable.

## Variables

The V3 engine is applied to temperature, precipitation, wind, gusts and cloud cover for hourly and daily central forecasts. Weather-condition codes remain a categorical family-balanced vote because a numeric bias correction is not meaningful for WMO condition classes.

## User interface

Settings > Forecast lets the user select Multi-consensus, Calibration, Scenarios or Adaptive. The selected engine is persisted locally.

Home and City Details use the same selected-engine context, including optional local weights and available calibration profiles. Home cards, current conditions, daily summaries, watchlist signals and mini-timelines therefore stay consistent with City Details.

City Details places the **Compare engines** button between model convergence and weather scenarios. It opens a seven-day matrix showing the same deadlines for all four engines, with the selected engine highlighted. The matrix includes minimum and maximum temperature, precipitation probability/amount, wind, gusts, cloud cover and condition, plus engine ranges, fallbacks, calibration coverage and detected scenario count when available.

## Interpretation and safeguards

A fallback is not an error. It means the requested engine does not have enough evidence to improve safely over the robust baseline for that variable/deadline.

Model convergence is intentionally calculated from the raw comparable model forecasts, not from engine output. This keeps two questions separate:

1. What do the source models agree on?
2. Given those models and local history, what central forecast does the selected engine produce?

The V3 implementation is designed for transparent client-side post-processing. It does not label the lightweight calibration as a full trained EMOS implementation, and it does not label scenario clustering as formal Bayesian Model Averaging. Those methods require a larger, consistently verified training archive and parameter fitting pipeline than the current local-history store provides.

## About-page documentation

The About page describes all four engines and includes engine selection as a dedicated step in the forecast-construction flow. The former “À retenir” summary block was removed from City Details because its signals duplicated convergence, scenarios, evolution and timeline information.
