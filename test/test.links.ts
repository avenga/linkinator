import { describe, expect, it } from 'vitest';
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
		} as unknown as Response;

		// Expect getLinks to reject with our error,
		await expect(getLinks(response, 'http://example.invalid')).rejects.toThrow(
			'StreamError',
		);
	});
});
