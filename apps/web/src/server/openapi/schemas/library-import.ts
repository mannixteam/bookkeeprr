import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Library import family — request schemas are the single source of truth, used
// BOTH for runtime validation in the route handlers
// (app/api/library/import/**) and for the generated OpenAPI spec.
//
// IMPORTANT: this module is import-pure (zod + relative siblings only); it
// MUST NOT import from @bookkeeprr/types or any server module. ESLint enforces
// this. Content-type values are duplicated from CONTENT_TYPES — keep in sync.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Content type enum duplicated here because this module is import-pure.
 * Must stay in sync with CONTENT_TYPES in @bookkeeprr/types.
 */
const ContentTypeEnum = z.enum(['manga', 'comic', 'light_novel', 'ebook', 'audiobook']);

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-schemas (also used in AdoptRow)
// ─────────────────────────────────────────────────────────────────────────────

/** One untracked item found on disk by the import scanner. */
export const ScanItemSchema = z.object({
  path: z.string().describe('Absolute path to the file (PER_FILE types) or directory (others).'),
  detectedTitle: z.string().describe('Title inferred from the filename / directory name.'),
  contentType: ContentTypeEnum,
  files: z.array(z.string()).describe('Absolute paths of the individual media files in this item.'),
  sizeBytes: z.number().int().describe('Total size in bytes across all files.'),
});

/** One metadata candidate returned by a search provider. */
export const CandidateSchema = z.object({
  sourceId: z.string().describe("Provider-specific identifier (e.g. 'OL123W' or 'gb:abc')."),
  title: z.string(),
  author: z.string().nullable(),
  year: z.number().int().nullable(),
  isbn: z.string().nullable(),
  coverUrl: z.string().nullable(),
  source: z.enum(['openlibrary', 'googlebooks', 'itunes']),
});

/** A scan item recognised as a volume of a series already in the library. */
export const ExistingSeriesMatchSchema = z.object({
  seriesId: z.number().int().positive().describe('Id of the matching library series.'),
  title: z.string().describe('Display title of the matching library series.'),
  contentType: ContentTypeEnum.describe("The library series' content type (authoritative)."),
  volume: z.number().int().describe('Volume number parsed from the item filename (defaults to 1).'),
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/library/import/scan
// ─────────────────────────────────────────────────────────────────────────────

/** One item from the scan with its best metadata match and alternatives. */
export const MatchedItemSchema = ScanItemSchema.extend({
  best: CandidateSchema.nullable().describe('Top-ranked metadata candidate, or null when no providers returned results.'),
  alternatives: z.array(CandidateSchema).describe('Up to 4 alternative candidates ranked below best.'),
  existingSeries: ExistingSeriesMatchSchema.nullable().describe(
    'Set when the item belongs to a series already in the library; the grid offers "add to that series" and no external match is run.',
  ),
});

/** POST /api/library/import/scan 200 — list of untracked items with metadata suggestions. */
export const ImportScanResponse = z.object({
  items: z.array(MatchedItemSchema),
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/library/import
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row submitted by the import grid confirm step. Exactly one of `match`
 * (adopt via a metadata candidate — new or resolved series) or `existingSeries`
 * (adopt into a series already in the library at the parsed volume) is set.
 */
export const AdoptRowSchema = z.object({
  item: ScanItemSchema,
  match: CandidateSchema.nullable().describe(
    'Chosen metadata candidate. Null when `existingSeries` drives the adoption instead.',
  ),
  existingSeries: ExistingSeriesMatchSchema.nullable()
    .optional()
    .describe('Set to adopt the file into an existing library series at its parsed volume.'),
  monitor: z.boolean().describe('When true, monitoring is set to "all"; false → "none".'),
  qualityProfileId: z.number().int().positive(),
});

/** POST /api/library/import request body. */
export const ImportAdoptBody = z.object({
  rows: z.array(AdoptRowSchema).min(1, 'rows must not be empty'),
});

/** POST /api/library/import 200. */
export const ImportAdoptResponse = z.object({
  imported: z.number().int().describe('Number of new library_file rows created across all rows.'),
  seriesIds: z.array(z.number().int()).describe('Deduplicated list of series ids touched.'),
  skipped: z
    .array(
      z.object({
        path: z.string().describe('Item path that was skipped.'),
        reason: z.string().describe('Human-readable reason the row was skipped.'),
      }),
    )
    .describe('Rows that could not be adopted (unsupported content type or transient error).'),
});
