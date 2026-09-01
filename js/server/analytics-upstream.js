// Server-only analytics destination. Keep plausible.io out of browser runtime
// modules so content blockers never see or need to evaluate a third-party URL.
export const PLAUSIBLE_UPSTREAM_EVENT = 'https://plausible.io/api/event';
