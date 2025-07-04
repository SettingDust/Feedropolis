import * as xpath from 'xpath'
import nightmareFetcher from './nightmare.js';
import simpleFetcher from './fetch.js';
import {Feed} from 'feed';
import Debug from 'debug';
import {URL} from 'node:url';
import getFilteredHtml from './getfilteredhtml.js';
import {FeedItem, FeedLoadParams, FeedModel, FeedSelector, SiteData} from '../util/types.js';
import {parseHTML} from "linkedom";

const debug = Debug('ap:feed');


export async function generateFeedFromSettings(settings: FeedModel) {
	debug('generateFeedFromSettings', settings);
	let html = await getHtml(settings.loadparams);
	html = await getFilteredHtml({ input: html, baseUrl: settings.url });
	debug('html filtered size', html.length);
	let doc = getDom(html);
	debug('dom', doc);
	let feedData = extractDataXpath(doc, settings.selectors);
	debug('feedData', feedData);
	let siteData = extractSitedata(doc, settings);
	feedData = sanitizeFeedData(feedData, siteData);
	let feed = createFeed(settings, feedData);
	debug('feed', feed);
	return feed;
}

export function extractSitedata(doc: Document, settings: { url: string }): SiteData {
	let res = {
		title: '',
		description: '',
		url: settings.url
	};

	let titleElem = xpath.select('//title/text()', doc);
	if (Array.isArray(titleElem) && !titleElem.length) titleElem = xpath.select('//h1/text()', doc);
	if (Array.isArray(titleElem) && titleElem.length) res.title = titleElem[0].textContent.trim();

	let descElem = xpath.select('//meta[@name="description"]/@content', doc)
	if (Array.isArray(descElem) && descElem.length) res.description = descElem[0].textContent.trim();

	if (!res.title) {
		let u = new URL(settings.url);
		res.title = u.hostname;
	}

	return res;
}

function sanitizeFeedData(feedData: FeedItem[], siteData: SiteData): FeedItem[] {
	return feedData.map(entry => {
		let v = {
			link: new URL(entry.link, new URL(siteData.url)).href,
			title: entry.title.trim(),
			description: entry.description ? entry.description.trim() : '',
			image: entry.image ? entry.image.trim() : '',
			added: new Date()
		}
		if (v.link.length > 255) {
			debug('link too long to save', v.link);
			return null;
		}
		if (v.title.length > 255) {
			v.title = v.title.substring(0, 255);
		}
		if (v.description.length > 255) {
			v.description = v.description.substring(0, 255);
		}
		if (v.image.length > 255) {
			v.image = '';
		}
		return v;
	}).filter(e => !!e)
}

export function getDom(html: string): Document {
	// debug('html', html);
	return parseHTML(html).document;
}

export async function getHtml(loadParams: FeedLoadParams): Promise<string> {
	let html;
	debug('getHtml', loadParams);
	if (loadParams.loadScripts) {
		html = await nightmareFetcher(loadParams);
	} else {
		html = await simpleFetcher(loadParams);
	}
	return html;
}

export function extractDataXpath(doc: Document, settings: FeedSelector): FeedItem[] {
	let data = [];
	let entries = xpath.select(settings.pathEntry, doc);
	if (!Array.isArray(entries)) {
		if (typeof entries !== 'object') {
			throw new Error('no entries found');
		}
		entries = [entries];
	}
	debug('entries', entries["length"] ?? 1);
	entries.forEach(entry => {
		// debug('entry', entry);
		let titleElem = xpath.select(settings.pathTitle, entry);
		let title = getValue(titleElem);
		if (!title) {
			debug('no title found', titleElem);
			return;
		}
		let linkElem = xpath.select(settings.pathLink, entry);
		let link = getValue(linkElem);
		if (!link) {
			debug('no link found', linkElem);
			return;
		}
		let description;
		if (settings.pathDescription) {
			let descriptionElem = xpath.select(settings.pathDescription, entry);
			description = getValue(descriptionElem);
		}
		let image;
		if (settings.pathImage) {
			let imageElem = xpath.select(settings.pathImage, entry);
			image = getValue(imageElem);
		}
		data.push({
			title,
			link,
			image,
			description
		});
	});
	function getValue(e: xpath.SelectReturnType) {
		if (Array.isArray(e)) {
			if (!e.length) return null;
			return e[0].textContent;
		}
		return e;
	}
	return data;
}

const baseUrl = process.env.BASE_URL || 'http://localhost';

export function createFeed(settings: FeedModel, feedData: FeedItem[]): Feed {
	let favUrl = new URL(settings.url);
	favUrl.pathname = '/favicon.ico';
	favUrl.search = '';
	const feed = new Feed({
		title: settings.title || 'unnamed',
		description: settings.description || 'no description',
		id: settings.url, //crypto.createHash('sha1').update(settings.url).digest('hex'),
		link: encodeURIComponent(settings.url),
		favicon: favUrl.href,
		generator: 'FeedroPolis',
		feedLinks: {
			atom: new URL(`/feed/get/${settings.uid || 0}/${settings.secret || 'none'}/`, new URL(baseUrl)).href
		},
		copyright: ''
	});
	feedData.forEach(({ title, link, description, added, image }) => {
		const item = {
			id: link,
			title,
			link,
			description,
			content: '',
			date: added
		};
		item.content += '<h1>'+title+'</h1>';
		if (description) item.content += '<p>'+description+'</p>';
		if (image) item.content += '<img src="'+image+'" />'
		feed.addItem(item);
	});
	return feed;
}
