'use strict';

/*
 * Builds example request data from the REAL Zod schemas.
 *
 * Every leaf value is chosen by running the schema's own safeParse over a list
 * of candidates, so examples satisfy regexes, enums, ranges and refinements
 * without anyone hand-copying rules. The caller still validates the finished
 * object against the whole schema (cross-field refinements) and reports any
 * route whose example does not pass.
 *
 * sample() returns { concrete, display }:
 *   concrete - passes the validator (used for verification)
 *   display  - same shape, with ids / emails / URLs replaced by {{variables}}
 */

const OBJECT_ID = '64b7f0c2a1b2c3d4e5f60718';

const STRINGS = {
  email: ['customer@example.com'],
  identifier: ['customer@example.com'],
  phone: ['03001234567', '+923001234567'],
  password: ['Sample#Pass12345'],
  name: ['Sample Name'],
  title: ['Sample title'],
  slug: ['sample-slug'],
  sku: ['PL-SAMPLE-42'],
  code: ['SAVE10', 'SAMPLE10'],
  color: ['#111111', 'Black'],
  hex: ['#111111'],
  token: ['t'.repeat(64)],
  city: ['Karachi'],
  province: ['Sindh'],
  postalCode: ['75500'],
  address: ['House 1, Street 2, Block 3'],
  line1: ['House 1, Street 2, Block 3'],
  country: ['Pakistan', 'PK'],
  reason: ['Sample reason for this request'],
  note: ['Sample note'],
  notes: ['Sample note'],
  description: ['Sample description text'],
  message: ['Sample message'],
  comment: ['Sample comment'],
  courier: ['TCS'],
  trackingNumber: ['TRK1234567890'],
  size: ['42'],
  currency: ['PKR'],
  link: ['/shop'],
  url: ['https://example.com/sample'],
  fcmToken: ['f'.repeat(120)],
  token_: ['t'.repeat(64)],
  search: ['sample'],
  q: ['sample'],
  date: ['2026-12-31T00:00:00.000Z', '2026-12-31'],
  from: ['2026-01-01'],
  to: ['2026-12-31'],
};

const GENERIC_STRINGS = [
  'Sample text',
  'sample',
  'sample-text',
  'SAMPLE-001',
  '03001234567',
  'customer@example.com',
  'https://example.com/sample',
  '/shop',
  '#111111',
  '2026-12-31T00:00:00.000Z',
  '2026-12-31',
  'a'.repeat(32),
  'a'.repeat(64),
  'Sample text for a longer field that needs a minimum number of characters to be accepted.',
];

const GENERIC_NUMBERS = [1, 10, 100, 500, 1000, 5, 2, 0, 0.5, 50, 12, 24, 3];

const MEDIA_KEY = /(image|photo|picture|thumbnail|banner|icon|artwork|attachment|document|reference|logo|cover|file|media|avatar|gallery|asset|url)/i;

const typeOf = (schema) => schema && schema._def && schema._def.typeName;

function keyHints(key) {
  if (!key) return [];

  const lowered = key.toLowerCase();
  const direct = STRINGS[key] || STRINGS[lowered] || [];
  const fuzzy = [];

  for (const [hint, values] of Object.entries(STRINGS)) {
    if (lowered.includes(hint.toLowerCase())) fuzzy.push(...values);
  }

  return [...direct, ...fuzzy];
}

function firstValid(schema, candidates) {
  for (const candidate of candidates) {
    if (schema.safeParse(candidate).success) return { ok: true, value: candidate };
  }

  return { ok: false };
}

function variableForObjectId(key) {
  if (!key) return 'resourceId';
  if (/Id$/.test(key)) return key;
  if (key === '_id' || key === 'id') return 'resourceId';

  return `${key}Id`;
}

function mediaVariable(key, value) {
  if (typeof value !== 'string' || !/^https?:\/\//.test(value)) return null;

  if (/canonical|link|website|redirect|href/i.test(key || '')) return null;

  return MEDIA_KEY.test(key || '') ? '{{mediaUrl}}' : null;
}

const ID_KEY = /(^|[a-z])Id$|^_?id$|^(product|variant|order|category|user|customer|coupon|quote|payment|request|style|pack|review|banner|media|device|notification)$/;

function leaf(schema, key, ctx) {
  const hinted = keyHints(key);

  if (ID_KEY.test(key || '') && schema.safeParse(OBJECT_ID).success) {
    return { concrete: OBJECT_ID, display: `{{${variableForObjectId(key)}}}` };
  }

  const stringTry = firstValid(schema, [...hinted, ...GENERIC_STRINGS]);

  if (stringTry.ok) {
    const value = stringTry.value;
    const mapped = ctx.variableFor ? ctx.variableFor(key, value) : null;

    return {
      concrete: value,
      display: mapped || mediaVariable(key, value) || value,
    };
  }

  // Regex-constrained id that was not named like an id (for example `sku`).
  if (schema.safeParse(OBJECT_ID).success) {
    return { concrete: OBJECT_ID, display: `{{${variableForObjectId(key)}}}` };
  }

  return null;
}

function sample(schema, key, ctx = {}, depth = 0) {
  if (!schema || depth > 8) return { concrete: undefined, display: undefined };

  const name = typeOf(schema);
  const def = schema._def;

  switch (name) {
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
    case 'ZodCatch':
    case 'ZodReadonly':
    case 'ZodBranded':
      return sample(def.innerType || def.type, key, ctx, depth + 1);

    case 'ZodLazy':
      return sample(def.getter(), key, ctx, depth + 1);

    case 'ZodPipeline':
      return sample(def.in, key, ctx, depth + 1);

    case 'ZodEffects': {
      // Try the effect-wrapped schema itself first: refinements on strings (urls, dates) live here.
      const whole = leaf(schema, key, ctx);

      if (whole) return whole;

      const numberTry = firstValid(schema, GENERIC_NUMBERS);

      if (numberTry.ok) return { concrete: numberTry.value, display: numberTry.value };

      return sample(def.schema, key, ctx, depth + 1);
    }

    case 'ZodString': {
      const result = leaf(schema, key, ctx);

      return result || { concrete: 'sample', display: 'sample' };
    }

    case 'ZodNumber': {
      const result = firstValid(schema, GENERIC_NUMBERS);

      return { concrete: result.ok ? result.value : 1, display: result.ok ? result.value : 1 };
    }

    case 'ZodBigInt':
      return { concrete: 1, display: 1 };

    case 'ZodBoolean': {
      const value = ctx.preferFalse ? false : true;

      return { concrete: value, display: value };
    }

    case 'ZodDate':
      return { concrete: '2026-12-31T00:00:00.000Z', display: '2026-12-31T00:00:00.000Z' };

    case 'ZodEnum':
      return { concrete: def.values[0], display: def.values[0] };

    case 'ZodNativeEnum': {
      const values = Object.values(def.values).filter((v) => typeof v === 'string' || typeof v === 'number');

      return { concrete: values[0], display: values[0] };
    }

    case 'ZodLiteral':
      return { concrete: def.value, display: def.value };

    case 'ZodNull':
      return { concrete: null, display: null };

    case 'ZodArray': {
      const min = def.minLength ? def.minLength.value : 1;
      const concrete = [];
      const display = [];

      for (let i = 0; i < Math.max(1, min); i += 1) {
        const item = sample(def.type, key, ctx, depth + 1);

        concrete.push(item.concrete);
        display.push(item.display);
      }

      return { concrete, display };
    }

    case 'ZodTuple': {
      const items = def.items.map((item) => sample(item, key, ctx, depth + 1));

      return { concrete: items.map((i) => i.concrete), display: items.map((i) => i.display) };
    }

    case 'ZodRecord':
      return { concrete: {}, display: {} };

    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': {
      const options = def.options instanceof Map ? [...def.options.values()] : def.options;

      return sample(options[0], key, ctx, depth + 1);
    }

    case 'ZodIntersection': {
      const left = sample(def.left, key, ctx, depth + 1);
      const right = sample(def.right, key, ctx, depth + 1);

      return {
        concrete: { ...left.concrete, ...right.concrete },
        display: { ...left.display, ...right.display },
      };
    }

    case 'ZodObject':
      return sampleObject(schema, ctx, depth);

    case 'ZodAny':
    case 'ZodUnknown':
      return { concrete: 'sample', display: 'sample' };

    default:
      return { concrete: undefined, display: undefined };
  }
}

function isOptionalField(field) {
  return field.isOptional();
}

/**
 * mode "all": every field. mode "required": required fields only.
 * Callers try "all" first (most informative example) and fall back.
 */
function sampleObject(schema, ctx, depth, mode = ctx.mode || 'all') {
  const shape = schema.shape;
  const concrete = {};
  const display = {};

  for (const [key, field] of Object.entries(shape)) {
    if (mode === 'required' && isOptionalField(field)) continue;
    if (mode === 'first' && Object.keys(concrete).length >= 1) break;
    if (ctx.skipKeys && ctx.skipKeys.includes(key)) continue;

    const value = sample(field, key, ctx, depth + 1);

    if (value.concrete === undefined) continue;

    concrete[key] = value.concrete;
    display[key] = value.display;
  }

  return { concrete, display };
}

/**
 * Best valid example for a body/query/params schema.
 * Returns { concrete, display, valid, issues, mode }.
 */
function buildExample(schema, ctx = {}, stringify = false) {
  const attempts = ['all', 'required', 'first'];
  let last = null;

  for (const mode of attempts) {
    const built = typeOf(schema) === 'ZodObject'
      ? sampleObject(schema, { ...ctx, mode }, 0, mode)
      : sample(schema, undefined, { ...ctx, mode });

    const input = stringify ? stringifyValues(built.concrete) : built.concrete;
    const parsed = schema.safeParse(input);

    last = {
      ...built,
      mode,
      valid: parsed.success,
      issues: parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };

    if (parsed.success) return last;
  }

  return last;
}

function stringifyValues(value) {
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, v === null || typeof v === 'object' ? JSON.stringify(v) : String(v)]),
  );
}

/** Field list for documentation: name, required flag, rough type. */
function describeFields(schema) {
  if (typeOf(schema) !== 'ZodObject') return [];

  return Object.entries(schema.shape).map(([name, field]) => {
    let inner = field;

    while (inner && ['ZodOptional', 'ZodNullable', 'ZodDefault', 'ZodEffects'].includes(typeOf(inner))) {
      inner = inner._def.innerType || inner._def.schema;
    }

    const kind = (typeOf(inner) || 'unknown').replace('Zod', '').toLowerCase();
    const enumValues = typeOf(inner) === 'ZodEnum' ? inner._def.values : null;

    return {
      name,
      required: !field.isOptional(),
      type: enumValues ? `enum(${enumValues.join(' | ')})` : kind,
    };
  });
}

module.exports = { buildExample, describeFields, stringifyValues, OBJECT_ID, MEDIA_KEY, typeOf };
