#!/usr/bin/env node

import process from 'node:process';
import chalk from 'chalk';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { type Flags, getConfig } from './config.ts';
import { LinkChecker } from './index.ts';
import { Format, LogLevel, Logger } from './logger.ts';
import type { CheckOptions } from './options.ts';
import {
	type CrawlResult,
	type LinkResult,
	LinkState,
	type RetryInfo,
} from './types.ts';

const parser = yargs(hideBin(process.argv))
	.usage(
		'Usage: $0 LOCATION [options]\n\nWith LOCATION being either the URLs or the paths on disk to check for broken links.',
	)
	.demandCommand(1, 'LOCATION is required')
	.options({
		concurrency: {
			type: 'number',
			describe:
				'The number of connections to make simultaneously. Defaults to 100.',
		},
		config: {
			type: 'string',
			describe:
				'Path to the config file to use. Looks for `linkinator.config.json` by default.',
		},
		directoryListing: {
			type: 'boolean',
			describe:
				"Include an automatic directory index file when linking to a directory. Defaults to 'false'.",
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
			describe:
				"Automatically retry requests that return HTTP 429 responses and include a 'retry-after' header. Defaults to false.",
		},
		retryNoHeader: {
			type: 'boolean',
			describe:
				"Automatically retry requests that return HTTP 429 responses and DON'T include a 'retry-after' header. Defaults to false.",
		},
		retryNoHeaderCount: {
			type: 'number',
			default: -1,
			describe:
				"How many times should a HTTP 429 response with no 'retry-after' header be retried? Defaults to -1 for infinite retries.",
		},
		retryNoHeaderDelay: {
			type: 'number',
			default: 30 * 60 * 1000,
			describe:
				"Delay in ms between retries for HTTP 429 responses with no 'retry-after' header.",
		},
		retryErrors: {
			type: 'boolean',
			describe:
				'Automatically retry requests that return 5xx or unknown response.',
		},
		retryErrorsCount: {
			type: 'number',
			default: 5,
			describe: 'How many times should an error be retried?',
		},
		retryErrorsJitter: {
			type: 'number',
			default: 3000,
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
			coerce: (arg) => {
				if (typeof arg === 'string') {
					return arg.split(/[\s,]+/).filter(Boolean) as string[];
				}

				if (Array.isArray(arg)) {
					const linksToSkip: string[] = [];
					for (const skip of arg) {
						linksToSkip.push(...skip.split(/[\s,]+/).filter(Boolean));
					}
					return linksToSkip;
				}
			},
			describe: 'List of urls in regexy form to not include in the check.',
		},
		timeout: {
			type: 'number',
			describe: 'Request timeout in ms. Defaults to 0 (no timeout).',
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
			describe: `The user agent passed in all HTTP requests. Defaults to 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.117 Safari/537.36'`,
		},
		verbosity: {
			type: 'string',
			choices: Object.values(LogLevel) as string[],
			describe:
				"Override the default verbosity for this command. Available options are 'debug', 'info', 'warning', 'error', and 'none'. Defaults to 'warning'.",
		},
	})
	.implies('urlRewriteSearch', 'urlRewriteReplace')
	.implies('urlRewriteReplace', 'urlRewriteSearch')
	.conflicts('silent', 'verbosity')
	.conflicts('verbosity', 'silent')
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
		recurse: flags.recurse,
		timeout: Number(flags.timeout),
		markdown: flags.markdown,
		concurrency: Number(flags.concurrency),
		serverRoot: flags.serverRoot,
		directoryListing: flags.directoryListing,
		retry: flags.retry,
		retryNoHeader: flags.retryNoHeader,
		retryNoHeaderCount: Number(flags.retryNoHeaderCount),
		retryNoHeaderDelay: Number(flags.retryNoHeaderDelay),
		retryErrors: flags.retryErrors,
		retryErrorsCount: Number(flags.retryErrorsCount),
		retryErrorsJitter: Number(flags.retryErrorsJitter),
	};

	// TODO: `skip` is already parsed to an array using yargs. Remove when `Flags` type is adjusted
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
