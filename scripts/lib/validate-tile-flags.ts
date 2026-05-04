/**
 * Pre-build validation for tippecanoe flags.
 *
 * Called before the 2-3 hour tippecanoe invocation to catch misconfigurations
 * early. Pure function — no I/O, no side effects.
 */

export interface TileFlagValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const REQUIRED_ATTRIBUTE_TYPES = [
  "class",
  "age",
  "species",
  "FIRE_YEAR",
  "DISTURBANCE_START_DATE",
  "company_id",
  "PLANNED_GROSS_BLOCK_AREA",
];

const COALESCE_FLAGS = [
  "--coalesce-smallest-as-needed",
  "--coalesce-densest-as-needed",
];

const DROP_FLAGS = [
  "--drop-densest-as-needed",
  "--drop-smallest-as-needed",
  "--drop-fraction-as-needed",
];

function extractFlagValue(cmd: string, flag: string): string | null {
  const pattern = new RegExp(`${flag}[=\\s](\\S+)`);
  const match = cmd.match(pattern);
  return match ? match[1] : null;
}

function hasFlag(cmd: string, flag: string): boolean {
  return cmd.includes(flag);
}

function extractAttributeTypes(cmd: string): string[] {
  const matches = cmd.matchAll(/--attribute-type=(\w+):/g);
  return [...matches].map((m) => m[1]);
}

export function validateTileFlags(cmdString: string): TileFlagValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Tile size cap range
  const mValue = extractFlagValue(cmdString, "-M");
  if (mValue) {
    const m = parseInt(mValue, 10);
    if (isNaN(m)) {
      errors.push(`-M value is not a number: "${mValue}"`);
    } else if (m < 1_000_000) {
      errors.push(`-M ${m} is below 1MB minimum — tiles will be aggressively pruned`);
    } else if (m > 10_000_000) {
      errors.push(`-M ${m} exceeds 10MB maximum — mobile clients will timeout`);
    }
  }

  // 2. Zoom sanity
  const minZoom = extractFlagValue(cmdString, "-Z");
  const maxZoom = extractFlagValue(cmdString, "-z");
  if (minZoom && maxZoom) {
    const zMin = parseInt(minZoom, 10);
    const zMax = parseInt(maxZoom, 10);
    if (!isNaN(zMin) && !isNaN(zMax) && zMin >= zMax) {
      errors.push(`Zoom range invalid: -Z ${zMin} must be less than -z ${zMax}`);
    }
  }

  // 3. Mutual exclusion: coalesce and drop flags
  const hasCoalesce = COALESCE_FLAGS.some((f) => hasFlag(cmdString, f));
  const hasDrop = DROP_FLAGS.some((f) => hasFlag(cmdString, f));
  if (hasCoalesce && hasDrop) {
    errors.push(
      "Both coalesce and drop flags present — these are mutually exclusive strategies"
    );
  }
  if (!hasCoalesce && !hasDrop) {
    warnings.push(
      "No tile-size reduction strategy (coalesce or drop) — tiles may exceed -M cap"
    );
  }

  // 4. Buffer minimum for polygon layers
  const bufferValue = extractFlagValue(cmdString, "--buffer");
  if (bufferValue) {
    const buf = parseInt(bufferValue, 10);
    if (!isNaN(buf) && buf < 32) {
      warnings.push(
        `--buffer=${buf} is below 32 — polygon features may clip at tile edges`
      );
    }
  }

  // 5. Attribute-type coverage
  const declaredTypes = extractAttributeTypes(cmdString);
  for (const required of REQUIRED_ATTRIBUTE_TYPES) {
    if (!declaredTypes.includes(required)) {
      warnings.push(
        `Missing --attribute-type for "${required}" — type inference may diverge across tiles`
      );
    }
  }

  // 6. Detail grid sanity
  const lowDetail = extractFlagValue(cmdString, "--low-detail");
  const minDetail = extractFlagValue(cmdString, "--minimum-detail");
  if (lowDetail && minDetail) {
    const ld = parseInt(lowDetail, 10);
    const md = parseInt(minDetail, 10);
    if (!isNaN(ld) && !isNaN(md) && ld < md) {
      errors.push(
        `--low-detail=${ld} is less than --minimum-detail=${md} — floor exceeds target`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
