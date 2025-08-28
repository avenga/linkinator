import { z } from 'zod';
import { DEFAULT_OPTIONS } from './options.ts';

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

export const CheckOptionsSchema = CommonOptionsSchema.extend({
	path: z.union([z.string(), z.array(z.string())]),
	port: z.int().optional(),
	linksToSkip: z.union([z.array(z.string()), z.function()]).optional(),
	urlRewriteExpressions: z
		.array(
			z.object({
				pattern: z.instanceof(RegExp),
				replacement: z.string(),
			}),
		)
		.optional(),
});

export const FlagsSchema = CommonOptionsSchema.extend({
	config: z.string().optional(),
	skip: z.union([z.string(), z.array(z.string())]).optional(),
	format: z.string().optional(),
	silent: z.boolean().optional(),
	verbosity: z.string().optional(),
	urlRewriteSearch: z.string().optional(),
	urlRewriteReplace: z.string().optional(),
});
