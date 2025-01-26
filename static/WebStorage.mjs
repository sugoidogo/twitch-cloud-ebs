export default class WebStorage {

    #origin=new URL(import.meta.url).origin
    /** @type {import('@twurple/auth').AuthProvider} */
    #auth_provider = null;
    /** @type {Cache} */
    #cache = null

    /**
     * 
     * @param {import('@twurple/auth').AuthProvider} auth_provider 
     */
    constructor(auth_provider) {
        this.#auth_provider = auth_provider
        auth_provider.getAccessTokenForUser()
            .then(token => caches.open(token.userId + '/' + auth_provider.clientId))
            .then(cache => this.#cache = cache)
    }

    /**
     * 
     * @param {String} resource 
     * @param {RequestInit} options 
     */
    async fetch(resource, options) {
        const token = await this.#auth_provider.getAccessTokenForUser()
        if (!options.headers) {
            options.headers = {}
        }
        options.headers['authorization'] = 'OAuth ' + token.accessToken
        resource = new URL(resource, this.#origin)
        if ('method' in options) {
            switch (options.method) {
                case 'PUT':
                case 'POST': {
                    const response = await fetch(resource, options)
                    if (!response.ok) {
                        return response
                    }
                    const blob = await new Request(resource, options).blob()
                    this.#cache.put(resource, new Response(blob))
                    return response
                }
                case 'DELETE': {
                    const response = await fetch(resource, options)
                    if (!response.ok) {
                        return response
                    }
                    this.#cache.delete(resource)
                    return response
                }
            }
        }
        return fetch(resource, options).then(
            response => {
                this.#cache.put(resource, response)
                return response
            },
            error => {
                console.warn(error)
                return this.#cache.match(resource)
            }
        )
    }
}