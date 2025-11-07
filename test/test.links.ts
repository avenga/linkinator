import { describe, expect, it } from 'vitest';
import type { CrawlOptions } from '../src/crawler.ts';
import { getLinks } from '../src/links.js';

describe('getLinks', () => {
	it('should reject when the HTML stream emits an error', async () => {
		const body = new ReadableStream({
			start(controller) {
				setTimeout(() => controller.error(new Error('StreamError')), 0);
			},
		});

		const response = {
			body,
			headers: new Headers({ 'content-type': 'text/html' }),
			clone: () => ({
				text: () => '',
			}),
		} as unknown as Response;

		// Expect getLinks to reject with our error,
		await expect(
			getLinks(response, {
				url: { href: 'http://example.invalid' },
				checkOptions: {},
			} as unknown as CrawlOptions),
		).rejects.toThrow('StreamError');
	});
});
