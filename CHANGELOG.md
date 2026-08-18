# Changelog

All notable changes to MeteoCompare Web are documented here. Releases follow Semantic Versioning.

## [1.10.2] - 2026-08-18

### Fixed
- Marine/coast summary now contains exactly five KPI cards on one desktop row; sea level remains in the richer tide summary instead of being duplicated.
- Hourly agreement SVG now uses its intrinsic aspect ratio instead of a fixed 330 px height, so the plot itself consumes the full available width without visual side gutters.

### Changed
- Removed redundant section eyebrows when they repeated the exact same title in Marine, Backup and Privacy sections.
- Marine KPI wrapping now starts only on narrower layouts, with two columns below 760 px and one column below 560 px.

## [1.10.1] - 2026-08-18

### Fixed
- Marine wave chart now has an explicit visible stroke even when no city-card accent variable is in scope.
- Hourly agreement chart consumes the full available desktop width while retaining horizontal scrolling on small screens.

### Changed
- Removed the inactive “Scenarios · 12 h” disclosure from home city cards.
- Tide view now includes a 72-hour filled curve, axes, time grid, mean level, high/low markers, trend and next-extremum summary.
- About page now explains the multi-model method, agreement semantics, local-first storage, marine limits, installation and release information in one coherent flow.

## [1.10.0] - 2026-08-18

### Added
- Approximate tide/high-low-water view in optional Marine mode using forecast sea-level height.
- 17-model health monitor with completed-run metadata, expected cadence, coverage, missing variables, fallback state and local 24h/7d incident history.
- Optional locally weighted consensus in TodaySummary, derived from bounded local J+1 reliability weights while keeping raw consensus and original forecasts unchanged.
- Health history storage, backup support and local-data accounting.

### Changed
- Marine request now includes sea-level height while remaining below ten hourly variables.
- Model metadata failures are separated from actual model incidents in the local health history.

## [1.9.0] - 2026-08-18

### Added
- Versioned release workflow with tagged ZIP and SHA-256 assets.
- Manual GitHub Pages rollback workflow able to redeploy a stable tag.
- Complete local backup/restore with selectable historical/cache data.
- Optional Marine/Coast mode backed by Open-Meteo Marine API.
- Client-side API request coordination, deduplication, usage counters and runaway guards.

### Changed
- Application version and service-worker cache version are now independent.
