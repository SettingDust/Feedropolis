import {FetchParams} from '../util/types.js';
import {chromium} from 'playwright';
import {PlaywrightBlocker} from '@ghostery/adblocker-playwright';
import {fetch} from "undici";
import fs from 'fs/promises';

const userAgent = process.env.USER_AGENT || 'Feedropolis RSS Generator';

export default async function (loadParams: FetchParams) {
	const browser = await chromium.launch()
	const context = await browser.newContext({
		userAgent: loadParams.userAgent ?? userAgent,
		storageState: {
			cookies: loadParams.cookies.split(';')
				.map(cookie => cookie.split('='))
				.map(cookie => ({
					name: cookie[0].trim(),
					value: cookie[1],
					domain: new URL(loadParams.url).hostname,
					path: '/',
					expires: -1,
					httpOnly: false,
					secure: true,
					sameSite: 'Lax'
				})),
			origins: []
		},
		extraHTTPHeaders: {
			...loadParams.headers,
			Referrer: loadParams.referrer ?? loadParams.url
		},
		proxy: { server: process.env.HTTPS_PROXY ?? process.env.http_proxy ?? process.env.https_proxy, bypass: process.env.no_proxy }
	})
	await context.tracing.start({screenshots: true, snapshots: true})
	const page = await context.newPage()
	await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch, {
		path: 'adblocker.bin',
		read: fs.readFile,
		write: fs.writeFile,
	}).then((blocker) => {
		blocker.enableBlockingInPage(page);
	});
	let result: string
	if (loadParams.body) {
		const resp = await context.request.post(loadParams.url, {
			data: loadParams.body
		})
		result = await resp.text()
	} else {
		await page.goto(loadParams.url, {
			referer: loadParams.referrer ?? loadParams.url,
			waitUntil: 'domcontentloaded'
		})
		result = await page.content()
	}
	if (loadParams.waitTime) {
		await new Promise(resolve => setTimeout(resolve, loadParams.waitTime))
	}
	if (loadParams.waitForSelector) {
		await page.waitForSelector(loadParams.waitForSelector)
	}
	await context.tracing.stop({path: 'trace.zip'})
	return result
}
