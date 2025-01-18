//import * as ebs from '@twurple/ebs-helper'

/** @type {URL} */
let url = null
let validation = null
let headers = new Headers({
	'access-control-allow-methods':'GET,HEAD,PUT,POST,DELETE,OPTIONS',
	'access-control-allow-origin': '*',
	'access-control-allow-headers': 'content-type, client-id, authorization',
	'access-control-allow-private-network': 'true',
	'cache-control': 'no-cache,private',
})

/**
 * create a Response object with preset headers
 * @param {BodyInit} body 
 * @param {ResponseInit} init 
 */
function newResponse(body = undefined, init = undefined) {
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

/**
 * 
 * @param {Request} request 
 * @param {*} env 
 */
async function validate(request, env) {
	const authorization =
		request.headers.get('authorization') ||
		url.searchParams.get('authorization') || ''
	const [type, helixToken, token] = authorization.split(' ')
	if (type.toLowerCase() !== 'extension') {
		let response = await fetch('https://id.twitch.tv/oauth2/validate', {
			headers: { authorization: authorization },
		})
		if (!response.ok) {
			return response
		}
		response = await response.json()
		response.secret = env[response.client_id]
		if (!response.secret) {
			return newResponse(null, { status: 403, statusText: 'unauthorized client' })
		}
		return newResponse(JSON.stringify(response))
	}
	try {
		const client_id = jwt.decode(helixToken).client_id
		const secret = env[client_id]
		if (!secret) {
			throw new Error('unrecognized client id')
		}
		const validation = jwt.verify(token, Buffer.from(secret, 'base64'))
		validation.client_id = client_id
		validation.secret = secret
		return newResponse(JSON.stringify(validation))
	} catch (error) {
		return newResponse(error.message, { status: 400 })
	}
}

/**
 * 
 * @param {Request} request 
 * @param {*} env 
 * @returns 
 */
async function oauth2(request, env) {
	if (url.pathname !== '/oauth2/token') {
		return newResponse(null, { status: 400 })
	}

	if (request.headers.get('content-type')!='multipart/form-data'){
		return newResponse(null, { status: 400 })
	}

	const requestBody = await request.formData()

	if (!requestBody.has('client_id')) {
		return newResponse('missing client_id', { status: 401, statusText: 'missing client_id' })
	}

	const client_secret = await env[requestBody.get('client_id')]

	if (client_secret === null) {
		return newResponse(null, { status: 403 })
	}

	requestBody.append('client_secret', client_secret)
	return fetch('https://id.twitch.tv/oauth2/token', {
		method: 'POST',
		body: requestBody
	})
}

/**
 * 
 * @param {Request} request 
 * @param {*} env 
 */
async function storage(request, env) {
	if (!validation.user_id) {
		return newResponse(null, { status: 403, statusText: 'storage api requires user access token' })
	}
	const clientPath = validation.user_id + '/' + validation.client_id + '/'
	const requestPath = url.pathname.replaceAll('/..', '')
	const objectName = (clientPath + requestPath).replaceAll('//', '/')
	console.debug(objectName)

	if (request.method === 'GET') {
		if (objectName.endsWith('/')){
			const options = {
				prefix: objectName,
				cursor: url.searchParams.get("cursor") ?? undefined
			}
			const listing = await env.storage.list(options)
			if (listing.truncated) {
				headers.append('cursor', listing.cursor)
			}
			const list=new Set()
			for(const object of listing.objects){
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
			return newResponse(null, {status:404})
		}

		object.writeHttpMetadata(headers)
		headers.set('etag', object.httpEtag)
		if (object.range) {
			headers.set("content-range", `bytes ${object.range.offset}-${object.range.end ?? object.size - 1}/${object.size}`)
		}
		const status = object.body ? (request.headers.get("range") !== null ? 206 : 200) : 304
		return newResponse(object.body, { status: status })
	}

	if (request.method === 'HEAD') {
		const object = await env.storage.head(objectName)

		if (object === null) {
			return newResponse(null, { status: 404 })
		}

		const headers = new Headers()
		object.writeHttpMetadata(headers)
		headers.set('etag', object.httpEtag)
		return newResponse(null, { headers: headers })
	}

	if (request.method === 'PUT' || request.method == 'POST') {
		const object = await env.storage.put(objectName, request.body, {
			httpMetadata: request.headers,
		})
		return newResponse(null, {
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

/**
 * 
 * @param {Request} request 
 * @param {*} env 
 */
async function ebs(request, env) {
	//TODO
}

async function serve_static(request, env) {
	/** @type {Response} */
	const response = await env.static.fetch(request)
	if (!response.ok) {
		return response
	}
	const blob = await response.blob()
	if(url.pathname.endsWith('js')){
		headers.append('content-type','text/javascript')
	}
	return newResponse(blob)
}

export default {
	/**
	 * 
	 * @param {Request} request 
	 * @param {*} env 
	 */
	async fetch(request, env) {
		if(request.method==='OPTIONS'){
			return newResponse()
		}
		url = new URL(request.url)
		if (env.serve_static) {
			const response = await serve_static(request.clone(), env)
			if (response.ok) {
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
		if (url.pathname.startsWith('/ebs')) {
			return ebs(request, env)
		}
		if (env.storage) {
			return storage(request, env)
		}
		return newResponse(null,{status:404})
	},
};
