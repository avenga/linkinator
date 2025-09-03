import { z } from 'zod';

export const DEFAULT_OPTIONS = {
	concurrency: 100,
	directoryListing: false,
	extraHeaders: {},
	retry: false,
	retryErrors: false,
	retryErrorsCount: 5,
	retryErrorsJitter: 5000,
	retryNoHeader: false,
	retryNoHeaderCount: -1,
	retryNoHeaderDelay: 30 * 60 * 1000,
	timeout: 20000,
	userAgent:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.117 Safari/537.36',
} satisfies Partial<CheckOptions>;

// Common schema for CLI, config file and API
export const CommonOptionsSchema = z.object({
	concurrency: z
		.int()
		.positive()
		.optional()
		.default(() => DEFAULT_OPTIONS.concurrency),
	recurse: z.boolean().optional(),
	timeout: z
		.int()
		.positive()
		.optional()
		.default(() => DEFAULT_OPTIONS.timeout),
	markdown: z.boolean().optional(),
	serverRoot: z.string().optional(),
	directoryListing: z
		.boolean()
		.optional()
		.default(() => DEFAULT_OPTIONS.directoryListing),
	retry: z
		.boolean()
		.optional()
		.default(() => DEFAULT_OPTIONS.retry),
	retryNoHeader: z
		.boolean()
		.optional()
		.default(() => DEFAULT_OPTIONS.retryNoHeader),
	retryNoHeaderCount: z
		.int()
		.optional()
		.default(() => DEFAULT_OPTIONS.retryNoHeaderCount),
	retryNoHeaderDelay: z
		.int()
		.optional()
		.default(() => DEFAULT_OPTIONS.retryNoHeaderDelay),
	retryErrors: z
		.boolean()
		.optional()
		.default(() => DEFAULT_OPTIONS.retryErrors),
	retryErrorsCount: z
		.int()
		.optional()
		.default(() => DEFAULT_OPTIONS.retryErrorsCount),
	retryErrorsJitter: z
		.int()
		.optional()
		.default(() => DEFAULT_OPTIONS.retryErrorsJitter),
	extraHeaders: z
		.record(z.string(), z.string())
		.optional()
		.default(() => DEFAULT_OPTIONS.extraHeaders),
	userAgent: z
		.string()
		.optional()
		.default(() => DEFAULT_OPTIONS.userAgent),
});

// Schema used for API
type LinksToSkipFn = (url: string) => boolean | Promise<boolean>;
export const CheckOptionsSchema = CommonOptionsSchema.extend({
	path: z
		.union([z.string().min(1), z.array(z.string().min(1)).nonempty()])
		.transform((val) => (Array.isArray(val) ? val : [val])),
	port: z.int().optional(),
	linksToSkip: z
		.union([
			z.array(z.string()),
			z.custom() as z.ZodType<LinksToSkipFn, LinksToSkipFn>,
		])
		.optional(),
	urlRewriteExpressions: z
		.array(
			z.object({
				pattern: z.instanceof(RegExp),
				replacement: z.string(),
			}),
		)
		.optional(),
});

export type CheckOptions = z.infer<typeof CheckOptionsSchema>;
export type CheckOptionsInput = z.input<typeof CheckOptionsSchema>;

// Schema used internally
export const InternalCheckOptionsSchema = CheckOptionsSchema.extend({
	syntheticServerRoot: z.string().optional(),
	staticHttpServerHost: z.string().optional(),
});

export type InternalCheckOptions = z.infer<typeof InternalCheckOptionsSchema>;
export type InternalCheckOptionsInput = z.input<
	typeof InternalCheckOptionsSchema
>;

// Schema used for CLI and config file
export const FlagsSchema = CommonOptionsSchema.extend({
	config: z.string().optional(),
	skip: z.union([z.string(), z.array(z.string())]).optional(),
	format: z.string().optional(),
	silent: z.boolean().optional(),
	verbosity: z.string().optional(),
	urlRewriteSearch: z.string().optional(),
	urlRewriteReplace: z.string().optional(),
});

export type Flags = z.infer<typeof FlagsSchema>;
export type FlagsInput = z.input<typeof FlagsSchema>;
