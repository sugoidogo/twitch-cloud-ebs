import fetch_retry from 'https://cdn.jsdelivr.net/npm/fetch-retry/+esm'
const fetch = fetch_retry(globalThis.fetch, { retries: 10, retryDelay: attempts => attempts * 1000 })

/**
 * @typedef {Object} TwitchToken
 * @property {String} access_token
 * @property {Number} expires_in
 * @property {Number} obtainment_timestamp
 * @property {String} token_type
 * @property {Number} [user_id]
 * @property {Array<String>} [scope]
 * @property {String} [refresh_token]
 * @property {String} [login]
 * @property {String} [client_id]
 */

/**
 * @typedef {Object} AuthCode
 * @property {String} code
 * @property {String} scope
 */

const redirect_uri = location.href.split('?')[0]
const proxy_uri = new URL('/oauth2/token', import.meta.url)

/**
 * Timestamp and return the token
 * @param {TwitchToken} token 
 * @returns {TwitchToken}
 */
function stamp(token) {
    token.obtainment_timestamp = Date.now()
    return token
}

/**
 * https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow
 * @param {String} client_id 
 * @returns {Promise<TwitchToken>}
 */
export function getAppToken(client_id) {
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
            throw await response.json()
        }
        const token = await response.json()
        return stamp(token)
    })
}

/**
 * https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#implicit-grant-flow
 * @param {String} client_id 
 * @param {Array<String>|String} scopes 
 * @returns {Promise<AuthCode>}
 */
export function requestAccessToken(client_id, ...scopes) {
    console.debug('requesting access token')
    const url = new URL('https://id.twitch.tv/oauth2/authorize')
    url.searchParams.append('response_type','token')
    url.searchParams.append('client_id', client_id)
    url.searchParams.append('scope', scopes.join(' '))
    location.assign(url+'&redirect_uri='+redirect_uri)
}

/**
 * https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#get-the-user-to-authorize-your-app
 * @param {String} client_id 
 * @param {Array<String>|String} scopes 
 * @returns {Promise<AuthCode>}
 */
export function requestAuthCode(client_id, ...scopes) {
    console.debug('requesting authorization code')
    const url = new URL('https://id.twitch.tv/oauth2/authorize')
    url.searchParams.append('response_type','code')
    url.searchParams.append('client_id', client_id)
    url.searchParams.append('scope', scopes.join(' '))
    location.assign(url+'&redirect_uri='+redirect_uri)
}

/**
 * https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#use-the-authorization-code-to-get-a-token
 * @param {String} client_id 
 * @param {String} code 
 * @returns {Promise<TwitchToken>}
 */
export function exchangeCode(client_id, code) {
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
            throw await response.json()
        }
        const token = await response.json()
        return stamp(token)
    })
}

/**
 * https://dev.twitch.tv/docs/authentication/validate-tokens/#how-to-validate-a-token
 * @param {String} access_token 
 * @returns {TwitchToken}
 */
export function validateToken(access_token) {
    console.debug('validating token')
    return fetch('https://id.twitch.tv/oauth2/validate', {
        headers: { authorization: 'OAuth ' + access_token }
    }).then(async response => {
        if (!response.ok) {
            throw await response.json()
        }
        /** @type {TwitchToken} */
        const token=await response.json()
        token.access_token=access_token
        token.scope=token.scopes
        delete token.scopes
        token.token_type='bearer'
        return stamp(token)
    })
}

/**
 * https://dev.twitch.tv/docs/authentication/refresh-tokens/#how-to-use-a-refresh-token
 * @param {String} client_id 
 * @param {String} refresh_token 
 * @returns {Promise<TwitchToken>}
 */
export function refreshToken(client_id, refresh_token) {
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
            throw await response.json()
        }
        return await response.json()
    })
}

/**
 * This function checks the url search parameters and hash for an auth code,
 * refresh token, access token, or error message, in that order,
 * and if it finds none of those, starts the auth code grant flow.
 * https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow
 * @param {String} client_id 
 * @returns {TwitchToken}
 */
export function getUserToken(client_id,...scopes){
    const params=new URLSearchParams(location.search+'&'+location.hash.substring(1))
    if(params.has('code')){
        const code=params.get('code')
        history.replaceState(null,'',redirect_uri)
        return exchangeCode(client_id,code)
    }
    if(params.has('refresh_token')){
        return refreshToken(client_id,params.get('refresh_token'))
    }
    if(params.has('access_token')){
        return validateToken(params.get('access_token'))
    }
    if(params.has('error')){
        const error_message=params.get('error')+': '+params.get('error_description')
        history.replaceState(null,'',redirect_uri)
        throw new Error(error_message)
    }
    return requestAuthCode(client_id,...scopes)
}

export default getUserToken