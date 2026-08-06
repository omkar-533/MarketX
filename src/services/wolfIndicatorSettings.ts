import { type PineSettingField, defaultsFromSettings } from './pineSettings';

const VALUES_KEY = 'wolf.terminal.indicator.settings';
const SCHEMA_KEY = 'wolf.terminal.indicator.schemas';

type SettingsMap = Record<string, Record<string, string | number | boolean>>;
type SchemaMap = Record<string, PineSettingField[]>;

function readValues(): SettingsMap {
  try {
    const raw = localStorage.getItem(VALUES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SettingsMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeValues(map: SettingsMap) {
  try {
    localStorage.setItem(VALUES_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

function readSchemas(): SchemaMap {
  try {
    const raw = localStorage.getItem(SCHEMA_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SchemaMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSchemas(map: SchemaMap) {
  try {
    localStorage.setItem(SCHEMA_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function rememberStudySettingsSchema(studyId: string, fields: PineSettingField[] | undefined) {
  if (!studyId || !fields?.length) return;
  const all = readSchemas();
  all[studyId] = fields;
  writeSchemas(all);
}

export function getStudySettingsSchema(studyId: string): PineSettingField[] {
  const remembered = readSchemas()[studyId];
  if (remembered?.length) return remembered;
  return NATIVE_FALLBACK[studyId] || [];
}

/** Built-in defaults when CMS has not published Pine yet. */
const NATIVE_FALLBACK: Record<string, PineSettingField[]> = {
  wolf_clusters_vp: [
    {
      key: 'lookback',
      label: 'Lookback Period',
      type: 'int',
      defaultValue: 200,
      min: 10,
      group: 'Clustering Settings',
    },
    {
      key: 'kInput',
      label: 'Number of Clusters',
      type: 'int',
      defaultValue: 5,
      min: 2,
      max: 10,
      group: 'Clustering Settings',
    },
    {
      key: 'iters',
      label: 'K-Means Iterations',
      type: 'int',
      defaultValue: 50,
      min: 5,
      max: 50,
      group: 'Clustering Settings',
    },
    {
      key: 'rowsInput',
      label: 'Rows per Cluster VP',
      type: 'int',
      defaultValue: 20,
      min: 2,
      group: 'Volume Profile Settings',
    },
  ],
};

export function loadIndicatorSettings(
  studyId: string,
  schema?: PineSettingField[],
): Record<string, string | number | boolean> {
  const fields = schema?.length ? schema : getStudySettingsSchema(studyId);
  const defaults = defaultsFromSettings(fields);
  const saved = readValues()[studyId] || {};
  return { ...defaults, ...saved };
}

export function saveIndicatorSettings(
  studyId: string,
  values: Record<string, string | number | boolean>,
) {
  const all = readValues();
  all[studyId] = values;
  writeValues(all);
  try {
    window.dispatchEvent(
      new CustomEvent('wolf-indicator-settings-changed', { detail: { studyId } }),
    );
  } catch {
    /* ignore */
  }
}

export function clearIndicatorSettings(studyId: string) {
  const all = readValues();
  delete all[studyId];
  writeValues(all);
  try {
    window.dispatchEvent(
      new CustomEvent('wolf-indicator-settings-changed', { detail: { studyId } }),
    );
  } catch {
    /* ignore */
  }
}

/** Map common Pine var names → native wolf compute options. */
export function clustersOptsFromSettings(
  values: Record<string, string | number | boolean> | undefined,
) {
  if (!values) return undefined;
  const num = (k: string) => {
    const v = values[k];
    return typeof v === 'number'
      ? v
      : typeof v === 'string' && v.trim() !== ''
        ? Number(v)
        : undefined;
  };
  return {
    lookback: num('lookback'),
    k: num('kInput') ?? num('k'),
    iters: num('iters'),
    rows: num('rowsInput') ?? num('rows'),
  };
}
