import * as cheerio from "cheerio";
import Debug from "debug";
import {URL} from "url";
import fetch from './fetch.js';
import FS from 'fs/promises';
import * as url from "node:url";

const debug = Debug('ap:getfilteredhtml');


export default async function run({
	removeScripts = true,
	removeIframes = true,
	removeLinks = true,
	inlineStylesheets = false,
	inlineScripts = [],
	appendScripts = [],
	input,
	baseUrl
}) {
	const $ = cheerio.load(input);
	$('html').attr('xmlns', null);
	if (removeScripts) $('script').remove();
	if (removeIframes) $('iframe').remove();
	if (removeLinks) $('link').not('[rel=stylesheet]').remove();
	if (inlineStylesheets) {
		let stylesheets = [];
		$('link').each((i, elem) => {
			stylesheets.push( $(elem) );
		});
		for (let stylesheet of stylesheets) {
			let href = stylesheet.attr('href');
			let content = '';
			if (href) {
				// let url = URL.resolve( baseUrl, href );
				let url = new URL(href, baseUrl).href;
				debug('loading stylesheet', url);
				content = await fetch({ url });
			}
			stylesheet.replaceWith(`<style>${content}</style>`);
		}
	}
	appendScripts.forEach(src => {
		$('body').append(`<script src="${src}"></script>`)
	});
	for (let url of inlineScripts) {
		let content;
		if (url.startsWith('http')) {
			content = await fetch({ url });
		} else {
			content = await FS.readFile(url, { encoding: 'utf8' });
		}
		$('body').append(`<script type="module">${content}</script>`)
	}
	$("a[href^='/'], img[src^='/']").each(function (this) {
		const $this = $(this);
		if ($this.attr("href")) {
			$this.attr("href", url.resolve(baseUrl, $this.attr("href")));
		}
		if ($this.attr("src")) {
			$this.attr("src", url.resolve(baseUrl, $this.attr("src")));
		}
	});
	return $.html();
}
