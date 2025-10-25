//import * as ebs from '@twurple/ebs-helper'

/** @type {URL} */
let url: URL
let validation: any
let headers: Headers

/**
 * create a Response object with preset headers
 */
function newResponse(body?: BodyInit, init?: ResponseInit) {
	if (!init) {
		init = {}
	}
	if (!init.headers) {
		init.headers = {}
	}
	Object.assign(init.headers, Object.fromEntries(headers))
	if (!body && init.status && init.status >= 400) {
		body = JSON.stringify({ status: init.status, message: init.statusText }) + '\n'
	}
	return new Response(body, init)
}

async function validate(request: Request, env: Env) {
	const authorization =
		request.headers.get('authorization') ||
		url.searchParams.get('authorization') || ''
	const [type, helixToken, token] = authorization.split(' ')
	let response: any = await fetch('https://id.twitch.tv/oauth2/validate', {
		headers: { authorization: authorization },
	})
	if (!response.ok) {
		return response
	}
	response = await response.json()
	response.secret = await env.client_secrets.get(response.client_id)
	if (!response.secret) {
		return newResponse(undefined, { status: 403, statusText: 'unauthorized client' })
	}
	return newResponse(JSON.stringify(response))
}

async function oauth2(request: Request, env: Env) {
	if (url.pathname !== '/oauth2/token') {
		return newResponse(undefined, { status: 404 })
	}

	if (!request.headers.get('content-type')!.includes('form')) {
		return newResponse(undefined, { status: 400, statusText: 'content type must be form data' })
	}

	const requestBody = await request.formData()

	if (!requestBody.has('client_id')) {
		return newResponse('missing client_id', { status: 401, statusText: 'missing client_id' })
	}

	const client_secret = await env.client_secrets.get(requestBody.get('client_id') as string)!

	if (!client_secret) {
		return newResponse(undefined, { status: 403, statusText: 'unauthorized client' })
	}

	requestBody.append('client_secret', client_secret)
	return fetch('https://id.twitch.tv/oauth2/token', {
		method: 'POST',
		body: requestBody
	})
}

async function storage(request: Request, env: Env) {
	if (!validation.user_id) {
		return newResponse(undefined, { status: 403, statusText: 'storage api requires user access token' })
	}
	const clientPath = validation.user_id + '/' + validation.client_id + '/'
	const requestPath = url.pathname.replaceAll('/..', '')
	const objectName = (clientPath + requestPath).replaceAll('//', '/')
	console.debug(objectName)

	if (request.method === 'GET') {
		if (objectName.endsWith('/')) {
			const options = {
				prefix: objectName,
				cursor: url.searchParams.get("cursor") ?? undefined
			}
			const listing = await env.storage.list(options)
			if (listing.truncated) {
				headers.append('cursor', listing.cursor)
			}
			const list = new Set()
			for (const object of listing.objects) {
				list.add(object.key.slice(objectName.length).split('/')[0])
			}
			headers.append('content-type', 'application/json')
			return newResponse(JSON.stringify([...list]))
		}
		const object = await env.storage.get(objectName, {
			range: request.headers,
			onlyIf: request.headers,
		})

		if (object === null) {
			return newResponse(undefined, { status: 404 })
		}

		object.writeHttpMetadata(headers)
		headers.set('etag', object.httpEtag)
		/* this came from a cloudflare example in javascript, 
		 * but I can't find documentation on R2Range, so can't fix this.
		if (object.range) {
			headers.set("content-range", `bytes ${object.range.offset}-${object.range.end ?? object.size - 1}/${object.size}`)
		}
		*/
		let responseBody: ReadableStream | undefined = undefined
		if ('body' in object) {
			responseBody = object.body
		}
		const status = responseBody ? (request.headers.get("range") !== null ? 206 : 200) : 304
		return newResponse(responseBody, { status: status })
	}

	if (request.method === 'HEAD') {
		const object = await env.storage.head(objectName)

		if (object === null) {
			return newResponse(undefined, { status: 404 })
		}

		const headers = new Headers()
		object.writeHttpMetadata(headers)
		headers.set('etag', object.httpEtag)
		return newResponse(undefined, { headers: headers })
	}

	if (request.method === 'PUT' || request.method == 'POST') {
		const object = await env.storage.put(objectName, request.body, {
			httpMetadata: request.headers,
		})
		return newResponse(undefined, {
			headers: {
				'etag': object.httpEtag,
			}
		})
	}

	if (request.method === 'DELETE') {
		await env.storage.delete(objectName)
		return newResponse()
	}

	return newResponse(`Unsupported method`, {
		status: 400
	})
}

async function serve_static(request: Request, env: Env) {
	if (url.pathname.endsWith('.mjs')) {
		headers.append('Location', url.href.replace('.mjs', '.js'))
		return newResponse(undefined, { status: 308 })
	}
	return newResponse(undefined, { status: 404 })
}

export default {
	async fetch(request: Request, env: Env) {
		url = new URL(request.url)
		const host = request.headers.get('host')
		if (host) {
			url.host = host
		}
		const proto = request.headers.get('x-forwarded-proto')
		if (proto) {
			url.protocol = proto
		}
		headers = new Headers({
			'access-control-allow-methods': 'GET,HEAD,PUT,POST,DELETE,OPTIONS',
			'access-control-allow-origin': '*',
			'access-control-allow-headers': 'content-type, client-id, authorization',
			'access-control-allow-private-network': 'true',
			'cache-control': 'no-cache,private',
		})
		if (request.method === 'OPTIONS') {
			return newResponse()
		}
		{
			const response = await serve_static(request, env)
			if (response.status < 400) {
				return response
			}
		}
		if (url.pathname.startsWith('/oauth2')) {
			return oauth2(request, env)
		}
		validation = await validate(request, env)
		if (!validation.ok) {
			return validation
		}
		validation = await validation.json()
		if (env.storage) {
			return storage(request, env)
		}
		return newResponse(undefined, { status: 404 })
	},
};