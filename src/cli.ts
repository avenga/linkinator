#!/usr/bin/env node

import process from 'node:process';
import chalk from 'chalk';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { type Flags, getConfig } from './config.ts';
import { LinkChecker } from './index.ts';
import { Format, LogLevel, Logger } from './logger.ts';
import { type CheckOptions, DEFAULT_OPTIONS } from './options.ts';
import {
	type CrawlResult,
	type LinkResult,
	LinkState,
	type RetryInfo,
} from './types.ts';

// `defaultDescription` is used instead of `default` to show the default values
// in the help but not actually set the values. This is done in `processOptions`
// so that options from the config file are not overwritten with CLI defaults.
const parser = yargs(hideBin(process.argv))
	.usage(
		'Usage: $0 LOCATION [options]\n\nWith LOCATION being either the URLs or the paths on disk to check for broken links.',
	)
	.demandCommand(1, 'LOCATION is required')
	.options({
		concurrency: {
			type: 'number',
			defaultDescription: DEFAULT_OPTIONS.concurrency.toString(),
			describe: 'The number of connections to make simultaneously.',
		},
		config: {
			type: 'string',
			describe:
				'Path to the config file to use. Looks for `linkinator.config.json` by default.',
		},
		directoryListing: {
			type: 'boolean',
			defaultDescription: DEFAULT_OPTIONS.directoryListing.toString(),
			describe:
				'Include an automatic directory index file when linking to a directory.',
		},
		format: {
			alias: 'f',
			type: 'string',
			describe: 'Return the data in CSV or JSON format.',
		},
		markdown: {
			type: 'boolean',
			describe:
				'Automatically parse and scan markdown if scanning from a location on disk.',
		},
		recurse: {
			alias: 'r',
			type: 'boolean',
			describe: 'Recursively follow links on the same root domain.',
		},
		retry: {
			type: 'boolean',
			defaultDescription: DEFAULT_OPTIONS.retry.toString(),
			describe:
				"Automatically retry requests that return HTTP 429 responses and include a 'retry-after' header.",
		},
		retryNoHeader: {
			type: 'boolean',
			defaultDescription: DEFAULT_OPTIONS.retryNoHeader.toString(),
			describe:
				"Automatically retry requests that return HTTP 429 responses and DON'T include a 'retry-after' header.",
		},
		retryNoHeaderCount: {
			type: 'number',
			defaultDescription: DEFAULT_OPTIONS.retryNoHeaderCount.toString(),
			describe:
				"How many times should a HTTP 429 response with no 'retry-after' header be retried?",
		},
		retryNoHeaderDelay: {
			type: 'number',
			defaultDescription: DEFAULT_OPTIONS.retryNoHeaderDelay.toString(),
			describe:
				"Delay in ms between retries for HTTP 429 responses with no 'retry-after' header.",
		},
		retryErrors: {
			type: 'boolean',
			defaultDescription: DEFAULT_OPTIONS.retryErrors.toString(),
			describe:
				'Automatically retry requests that return 5xx or unknown response.',
		},
		retryErrorsCount: {
			type: 'number',
			defaultDescription: DEFAULT_OPTIONS.retryErrorsCount.toString(),
			describe: 'How many times should an error be retried?',
		},
		retryErrorsJitter: {
			type: 'number',
			defaultDescription: DEFAULT_OPTIONS.retryErrorsJitter.toString(),
			describe: 'Random jitter in ms applied to error retry.',
		},
		serverRoot: {
			type: 'string',
			describe:
				'When scanning a local directory, customize the location on disk where the server is started. Defaults to the path passed in [LOCATION].',
		},
		silent: {
			type: 'boolean',
			describe: 'Silence output (alias for --verbosity error).',
		},
		skip: {
			alias: 's',
			type: 'string',
			describe: 'List of urls in regexy form to not include in the check.',
		},
		timeout: {
			type: 'number',
			defaultDescription: DEFAULT_OPTIONS.timeout.toString(),
			describe: 'Request timeout in ms.',
		},
		urlRewriteSearch: {
			type: 'string',
			describe:
				'Pattern to search for in urls. Must be used with --url-rewrite-replace.',
		},
		urlRewriteReplace: {
			type: 'string',
			describe:
				'Expression used to replace search content. Must be used with --url-rewrite-search.',
		},
		userAgent: {
			type: 'string',
			defaultDescription: DEFAULT_OPTIONS.userAgent.toString(),
			describe: 'The user agent passed in all HTTP requests.',
		},
		verbosity: {
			type: 'string',
			describe:
				"Override the default verbosity for this command. Available options are 'debug', 'info', 'warning', 'error', and 'none'. Defaults to 'warning'.",
		},
	})
	.implies('urlRewriteSearch', 'urlRewriteReplace')
	.implies('urlRewriteReplace', 'urlRewriteSearch')
	.conflicts('silent', 'verbosity')
	.conflicts('verbosity', 'silent')
	.version(false)
	.strict()
	.help()
	.example([
		['$0 docs/'],
		['$0 https://www.google.com'],
		['$0 . --recurse'],
		['$0 . --skip www.googleapis.com'],
		['$0 . --format CSV'],
	]);

async function main() {
	const argv = await parser.parseAsync();

	const inputs = argv._.map((v) => v.toString());
	const flags = await getConfig(argv);

	const start = Date.now();
	const verbosity = parseVerbosity(flags);
	const format = parseFormat(flags);
	const logger = new Logger(verbosity, format);

	logger.error(`🏊‍♂️ crawling ${inputs.join(' ')}`);

	const checker = new LinkChecker();
	if (format === Format.CSV) {
		console.log('url,status,state,parent,failureDetails');
	}

	checker.on('retry', (info: RetryInfo) => {
		logger.warn(`Retrying: ${info.url} in ${info.secondsUntilRetry} seconds.`);
	});
	checker.on('link', (link: LinkResult) => {
		handleLink(link, logger, format, verbosity);
	});

	const options: CheckOptions = {
		path: inputs,
		...flags,
	};

	if (flags.skip) {
		if (typeof flags.skip === 'string') {
			options.linksToSkip = flags.skip.split(/[\s,]+/).filter(Boolean);
		} else if (Array.isArray(flags.skip)) {
			options.linksToSkip = [];
			for (const skip of flags.skip) {
				options.linksToSkip.push(...skip.split(/[\s,]+/).filter(Boolean));
			}
		}
	}

	if (flags.urlRewriteSearch && flags.urlRewriteReplace) {
		options.urlRewriteExpressions = [
			{
				pattern: new RegExp(flags.urlRewriteSearch),
				replacement: flags.urlRewriteReplace,
			},
		];
	}

	const result = await checker.check(options);
	outputResults(result, format, verbosity, logger, start);
}

function handleLink(
	link: LinkResult,
	logger: Logger,
	format: Format,
	verbosity: LogLevel,
) {
	let state = '';
	switch (link.state) {
		case LinkState.BROKEN: {
			state = `[${chalk.red(link.status?.toString())}]`;
			logger.error(`${state} ${chalk.gray(link.url)}`);
			break;
		}

		case LinkState.OK: {
			state = `[${chalk.green(link.status?.toString())}]`;
			logger.warn(`${state} ${chalk.gray(link.url)}`);
			break;
		}

		case LinkState.SKIPPED: {
			state = `[${chalk.grey('SKP')}]`;
			logger.info(`${state} ${chalk.gray(link.url)}`);
			break;
		}
	}

	if (format === Format.CSV && shouldShowResult(link, verbosity)) {
		const failureDetails = link.failureDetails
			? JSON.stringify(link.failureDetails, null, 2)
			: '';
		console.log(
			`"${link.url}",${link.status},${link.state},"${link.parent || ''}","${failureDetails}"`,
		);
	}
}

function outputResults(
	result: CrawlResult,
	format: Format,
	verbosity: LogLevel,
	logger: Logger,
	start: number,
) {
	const filteredResults = result.links.filter((l) =>
		shouldShowResult(l, verbosity),
	);

	if (format === Format.JSON) {
		result.links = filteredResults;
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	if (format === Format.CSV) {
		return;
	}

	// Build a collection scanned links, collated by the parent link used in
	// the scan.  For example:
	// {
	//   "./README.md": [
	//     {
	//       url: "https://img.shields.io/npm/v/linkinator.svg",
	//       status: 200
	//       ....
	//     }
	//   ],
	// }
	const parents = result.links.reduce<Record<string, LinkResult[]>>(
		(accumulator, current) => {
			const parent = current.parent || '';
			accumulator[parent] ||= [];

			accumulator[parent].push(current);
			return accumulator;
		},
		{},
	);

	for (const parent of Object.keys(parents)) {
		// Prune links based on verbosity
		const links = parents[parent].filter((link) => {
			if (verbosity === LogLevel.NONE) {
				return false;
			}

			if (link.state === LinkState.BROKEN) {
				return true;
			}

			if (link.state === LinkState.OK && verbosity <= LogLevel.WARNING) {
				return true;
			}

			if (link.state === LinkState.SKIPPED && verbosity <= LogLevel.INFO) {
				return true;
			}

			return false;
		});

		if (links.length === 0) {
			continue;
		}

		logger.error(chalk.blue(parent));
		for (const link of links) {
			let state = '';
			switch (link.state) {
				case LinkState.BROKEN: {
					state = `[${chalk.red(link.status?.toString())}]`;
					logger.error(`  ${state} ${chalk.gray(link.url)}`);
					logger.debug(JSON.stringify(link.failureDetails, null, 2));
					break;
				}

				case LinkState.OK: {
					state = `[${chalk.green(link.status?.toString())}]`;
					logger.warn(`  ${state} ${chalk.gray(link.url)}`);
					break;
				}

				case LinkState.SKIPPED: {
					state = `[${chalk.grey('SKP')}]`;
					logger.info(`  ${state} ${chalk.gray(link.url)}`);
					break;
				}
			}
		}
	}

	const total = (Date.now() - start) / 1000;
	const scannedLinks = result.links.filter(
		(x) => x.state !== LinkState.SKIPPED,
	);
	if (!result.passed) {
		const borked = result.links.filter((x) => x.state === LinkState.BROKEN);
		logger.error(
			chalk.bold(
				`${chalk.red('ERROR')}: Detected ${
					borked.length
				} broken links. Scanned ${chalk.yellow(
					scannedLinks.length.toString(),
				)} links in ${chalk.cyan(total.toString())} seconds.`,
			),
		);
		process.exit(1);
	}

	logger.error(
		chalk.bold(
			`🤖 Successfully scanned ${chalk.green(
				scannedLinks.length.toString(),
			)} links in ${chalk.cyan(total.toString())} seconds.`,
		),
	);
}

function parseVerbosity(flags: Flags): LogLevel {
	if (flags.silent) {
		return LogLevel.ERROR;
	}

	if (!flags.verbosity) {
		return LogLevel.WARNING;
	}

	const verbosity = flags.verbosity.toUpperCase();
	const options = Object.values(LogLevel);
	if (!options.includes(verbosity)) {
		throw new Error(
			`Invalid flag: VERBOSITY must be one of [${options.join(',')}]`,
		);
	}

	return LogLevel[verbosity as keyof typeof LogLevel];
}

function parseFormat(flags: Flags): Format {
	if (!flags.format) {
		return Format.TEXT;
	}

	flags.format = flags.format.toUpperCase();
	const options = Object.values(Format);
	if (!options.includes(flags.format)) {
		throw new Error("Invalid flag: FORMAT must be 'TEXT', 'JSON', or 'CSV'.");
	}

	return Format[flags.format as keyof typeof Format];
}

function shouldShowResult(link: LinkResult, verbosity: LogLevel) {
	switch (link.state) {
		case LinkState.OK: {
			return verbosity <= LogLevel.WARNING;
		}

		case LinkState.BROKEN: {
			if (verbosity > LogLevel.DEBUG) {
				link.failureDetails = undefined;
			}

			return verbosity <= LogLevel.ERROR;
		}

		case LinkState.SKIPPED: {
			return verbosity <= LogLevel.INFO;
		}
	}
}

await main();
