import { z } from 'zod';

export const CommonOptionsSchema = z.object({
	concurrency: z.number().positive().optional(),
	recurse: z.boolean().optional(),
	timeout: z.number().positive().optional(),
	markdown: z.boolean().optional(),
	serverRoot: z.string().optional(),
	directoryListing: z.boolean().optional(),
	retry: z.boolean().optional(),
	retryNoHeader: z.boolean().optional(),
	retryNoHeaderCount: z.number().optional(),
	retryNoHeaderDelay: z.number().optional(),
	retryErrors: z.boolean().optional(),
	retryErrorsCount: z.number().optional(),
	retryErrorsJitter: z.number().optional(),
	extraHeaders: z.record(z.string(), z.string()).optional(),
	userAgent: z.string().optional(),
});

export const CheckOptionsSchema = CommonOptionsSchema.extend({
	path: z.union([z.string(), z.array(z.string())]),
	port: z.number().optional(),
	linksToSkip: z
		.union([
			z.array(z.string()),
			z.function({
				input: [z.string()],
				output: z.promise(z.boolean()),
			}),
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

export const FlagsSchema = CommonOptionsSchema.extend({
	config: z.string().optional(),
	skip: z.union([z.string(), z.array(z.string())]).optional(),
	format: z.string().optional(),
	silent: z.boolean().optional(),
	verbosity: z.string().optional(),
	urlRewriteSearch: z.string().optional(),
	urlRewriteReplace: z.string().optional(),
});
