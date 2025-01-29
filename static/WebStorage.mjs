/**
 * @callback fetch
 * @param {RequestInfo} resource
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */

export default class WebStorage {

    #origin = new URL(import.meta.url).origin
    /** @type {import('@twurple/auth').AuthProvider} */
    #auth_provider = null;
    /** @type {Cache} */
    #cache = null
    /** @type {fetch} */
    #fetch = null

    /**
     * Creates a fetch request wrapper that returns cached responses when the server can't be reached.
     * When only a path is provided, the origin defaults to the same origin this module was loaded from.
     * When the origin matches this script, authorization headers are added automatically.
     * You can also use this for GET requests to any orgigin, but other methods may have unknown behavior.
     * @param {import('@twurple/auth').AuthProvider} auth_provider used to add the authentication header to requests for web storage
     * @param {fetch} fetch defaults to `globalThis.fetch`, allows you to further customize fetch behavior via chaining, for example with `fetch-retry`
     */
    constructor(auth_provider, fetch = (resource,options)=>{return globalThis.fetch(resource,options)}) {
        this.#fetch = fetch
        this.#auth_provider = auth_provider
        auth_provider.getAccessTokenForUser()
            .then(token => caches.open(token.userId + '/' + auth_provider.clientId))
            .then(cache => this.#cache = cache)
    }

    /**
     * 
     * @param {String | URL} resource 
     * @param {RequestInit} options 
     */
    async fetch(resource, options={}) {
        resource = new URL(resource, this.#origin)
        if (resource.origin == this.#origin) {
            const token = await this.#auth_provider.getAccessTokenForUser()
            if (!options.headers) {
                options.headers = {}
            }
            options.headers['authorization'] = 'OAuth ' + token.accessToken
        }
        if ('method' in options) {
            switch (options.method) {
                case 'PUT':
                case 'POST': {
                    const response = await this.#fetch(resource, options)
                    if (!response.ok) {
                        return response
                    }
                    const blob = await new Request(resource, options).blob()
                    this.#cache.put(resource, new Response(blob))
                    return response
                }
                case 'DELETE': {
                    const response = await this.#fetch(resource, options)
                    if (!response.ok) {
                        return response
                    }
                    this.#cache.delete(resource)
                    return response
                }
            }
        }
        return this.#fetch(resource, options)
            .then(async response => {
                if (response.status >= 500) {
                    throw new Error(response.statusText + '\n' + await response.text())
                }
                this.#cache.put(resource, response.clone())
                return response
            }).catch(error => {
                console.warn(error)
                return this.#cache.match(resource)
            }
        )
    }
}