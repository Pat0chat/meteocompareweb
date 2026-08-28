import '../app-version.js';

export const APP_VERSION = globalThis.METEOCOMPARE_APP_VERSION;
if(!APP_VERSION) throw new Error('Missing MeteoCompare application version');

export const DATA_SCHEMA_VERSION = 4;
export const BACKUP_FORMAT_VERSION = 1;
