import Debug from "debug";
import {FetchParams} from "../util/types.js";
import {Dispatcher, EnvHttpProxyAgent, request, setGlobalDispatcher} from 'undici'

const debug = Debug('ap:fetch');
const userAgent = process.env.USER_AGENT || 'Feedropolis RSS Generator';

setGlobalDispatcher(new EnvHttpProxyAgent())

export default async function (loadParams: FetchParams) {
	debug('fetch ' + loadParams.url);
	const params: { dispatcher?: Dispatcher }
		& Omit<Dispatcher.RequestOptions, 'origin' | 'path' | 'method'>
		& Partial<Pick<Dispatcher.RequestOptions, 'method'>> = {
		headersTimeout: 10000,
		headers: {
			'User-Agent': userAgent
		},
	}
	if (loadParams.body) {
		params.body = loadParams.body;
		params.method = 'POST';
	}
	if (loadParams.headers) {
		Object.assign(params.headers, loadParams.headers);
	}
	if (loadParams.cookies) {
		params.headers['Cookie'] = loadParams.cookies;
	}
	if (loadParams.referrer) {
		params.headers['Referrer'] = loadParams.referrer
	}

	const {body} = await request(loadParams.url, params);
	return await body.text();
};
