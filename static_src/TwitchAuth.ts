import fetch_retry from 'fetch-retry'
const fetch = fetch_retry(globalThis.fetch, {
    retries: 10,
    retryDelay: attempts => attempts * 1000
})

export interface TwitchToken {
    access_token: string
    expires_in: number
    obtainment_timestamp: number
    token_type: string
    user_id?: number
    scope?: Array<string>
    refresh_token?: string
    login?: string
    client_id?: string
}

export interface AuthCode {
    code: string
    scope: string
}

const redirect_uri = location.origin + location.pathname
const proxy_uri = new URL('/oauth2/token', import.meta.url)

/**
 * Timestamp and return the token
 * @param {TwitchToken} token 
 * @returns {TwitchToken}
 */
function stamp(token: TwitchToken): TwitchToken {
    token.obtainment_timestamp = Date.now()
    return token
}

/**
 * https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow
 * @param {string} client_id 
 * @returns {Promise<TwitchToken>}
 */
export function getAppToken(client_id: string): Promise<TwitchToken> {
    const searchParams = new URLSearchParams({
        client_id: client_id,
        grant_type: 'client_credentials'
    })
    return fetch(proxy_uri, {
        method: 'POST',
        body: searchParams.toString(),
        headers: { 'content-type': 'application/x-www-form-urlencoded' }
    }).then(async function (response) {
        if (!response.ok) {
            throw new Error(await response.text())
        }
        const token = await response.json()
        return stamp(token)
    })
}

/**
 * https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#implicit-grant-flow
 * @param {string} client_id 
 * @param {Array<string>|string} scopes 
 * @returns {Promise<AuthCode>}
 */
export function requestAccessToken(client_id: string, ...scopes: Array<string>) {
    console.debug('requesting access token')
    const url = new URL('https://id.twitch.tv/oauth2/authorize')
    url.searchParams.append('response_type', 'token')
    url.searchParams.append('client_id', client_id)
    url.searchParams.append('scope', scopes.join(' '))
    location.assign(url + '&redirect_uri=' + redirect_uri)
}

/**
 * https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#get-the-user-to-authorize-your-app
 * @param {string} client_id 
 * @param {Array<string>|string} scopes 
 * @returns {Promise<AuthCode>}
 */
export function requestAuthCode(client_id: string, ...scopes: Array<string>): Promise<any> {
    console.debug('requesting authorization code')
    const url = new URL('https://id.twitch.tv/oauth2/authorize')
    url.searchParams.append('response_type', 'code')
    url.searchParams.append('client_id', client_id)
    url.searchParams.append('scope', scopes.join(' ').trim())
    location.assign(url + '&redirect_uri=' + redirect_uri)
    return new Promise(()=>{})
}

/**
 * https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#use-the-authorization-code-to-get-a-token
 * @param {string} client_id 
 * @param {string} code 
 * @returns {Promise<TwitchToken>}
 */
export function exchangeCode(client_id: string, code: string): Promise<TwitchToken> {
    console.debug('exchanging authorization code')
    const searchParams = new URLSearchParams({
        client_id: client_id,
        code: code,
        grant_type: 'authorization_code'
    })
    return fetch(proxy_uri, {
        method: 'POST',
        body: searchParams.toString() + '&redirect_uri=' + redirect_uri,
        headers: { 'content-type': 'application/x-www-form-urlencoded' }
    }).then(async function (response) {
        if (!response.ok) {
            throw new Error(await response.text())
        }
        const token = await response.json()
        return stamp(token)
    })
}

/**
 * https://dev.twitch.tv/docs/authentication/validate-tokens/#how-to-validate-a-token
 * @param {string} access_token 
 * @returns {TwitchToken}
 */
export async function validateToken(access_token: string): Promise<TwitchToken> {
    console.debug('validating token')
    return fetch('https://id.twitch.tv/oauth2/validate', {
        headers: { authorization: 'OAuth ' + access_token }
    }).then(async response => {
        if (!response.ok) {
            throw new Error(await response.text())
        }
        /** @type {TwitchToken} */
        const token: any = await response.json()
        token.access_token = access_token
        token.scope = token.scopes
        delete token.scopes
        token.token_type = 'bearer'
        return stamp(token)
    })
}

/**
 * https://dev.twitch.tv/docs/authentication/refresh-tokens/#how-to-use-a-refresh-token
 * @param {string} client_id 
 * @param {string} refresh_token 
 * @returns {Promise<TwitchToken>}
 */
export function refreshToken(client_id: string, refresh_token: string): Promise<TwitchToken> {
    console.debug('refreshing token')
    const searchParams = new URLSearchParams({
        client_id: client_id,
        grant_type: 'refresh_token',
        refresh_token: refresh_token
    })
    return fetch(proxy_uri, {
        method: 'POST',
        body: searchParams.toString(),
        headers: { 'content-type': 'application/x-www-form-urlencoded' }
    }).then(async function (response) {
        if (!response.ok) {
            throw new Error(await response.text())
        }
        return await response.json()
    })
}

/**
 * This function checks the url search parameters and hash for an auth code,
 * refresh token, access token, or error message, in that order,
 * and if it finds none of those, starts the auth code grant flow.
 * https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow
 * @param {string} client_id 
 * @returns {TwitchToken}
 */
export async function getUserToken(client_id: string, ...scopes): Promise<TwitchToken> {
    const token=await getUserTokenPassive(client_id, ...scopes)
    if(!token){
        return requestAuthCode(client_id, ...scopes)
    }
    return token
}

/**
 * This function checks the url search parameters and hash for an auth code,
 * refresh token, access token, or error message, in that order.
 * https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow
 * @param {string} client_id 
 * @returns {TwitchToken}
 */
export async function getUserTokenPassive(client_id: string, ...scopes): Promise<TwitchToken>{
    console.debug('scopes requested:',...scopes)
    const params = new URLSearchParams(location.search + '&' + location.hash.substring(1))
    if (params.has('code')) {
        const code = params.get('code')
        history.replaceState(null, '', redirect_uri)
        return exchangeCode(client_id, code)
    }
    if (params.has('refresh_token')) {
        return refreshToken(client_id, params.get('refresh_token'))
    }
    if (params.has('access_token')) {
        return validateToken(params.get('access_token'))
    }
    if (params.has('error')) {
        const error_message = params.get('error') + ': ' + params.get('error_description')
        history.replaceState(null, '', redirect_uri)
        throw new Error(error_message)
    }
    return null
}

export default getUserToken