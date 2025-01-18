let localStorage=globalThis.localStorage
import('https://cdn.jsdelivr.net/npm/localforage@1/+esm')
.then(module=>module.default)
.then(localforage=>{localStorage=localforage.createInstance({name:import.meta.url})})
.catch(e=>console.warn('localforage failed, using localStorage',e))

/**
 * @typedef {Object} TwitchToken
 * @property {String} access_token
 * @property {Number} expires_in
 * @property {String} token_type
 * @property {String} [refresh_token]
 * @property {Array<String>} [scope]
 * @property {Number} [obtainment_timestamp]
 * @property {Number} [user_id]
 */

/**
 * @typedef {Object} AuthCode
 * @property {String} code
 * @property {String} scope
 */

/**
 * Starts the process of fetching a resource from the network, returning a promise that is fulfilled once the response is available.
 * This version of fetch retries requests on "Failed to fetch" errors to account for OBS startup bottlenecking
 * @param {RequestInfo | URL} input
 * @param {RequestInit} init
 * @returns {Promise<Response>}
 */
function fetch(input,init=undefined){
    return window.fetch(input,init).catch(async error=>{
        if(error.message==="Failed to fetch"){
            await new Promise(function(resolve,reject){
                setTimeout(resolve,1000)
            })
            return fetch(input,init)
        }else{
            throw error
        }
    })
}

/**
 * Twitch auth token management supporting app tokens and refresh tokens with the accompanying proxy server
 */
export default class TwitchAuth {

    static #redirect_uri=new URL('/code.html',import.meta.url)
    static #proxy_uri=new URL('/oauth2/token',import.meta.url)

    /**
     * https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow
     * @param {String} client_id 
     * @returns {Promise<TwitchToken>}
     */
    static getAppToken(client_id){
        const searchParams=new URLSearchParams({
            client_id:client_id,
            grant_type:'client_credentials'
        })
        return fetch(this.#proxy_uri,{
            method:'POST',
            body:searchParams.toString(),
            headers:{'content-type':'application/x-www-form-urlencoded'}
        }).then(async function(response){
            if(!response.ok){
                throw await response.json()
            }
            return await response.json()
        })
    }

    /**
     * https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#get-the-user-to-authorize-your-app
     * @param {String} client_id 
     * @param {Array<String>} scopes 
     * @returns {Promise<AuthCode>}
     */
    static requestAuthCode(client_id,...scopes){
        console.debug('requesting authorization code')
        const url=new URL(this.#redirect_uri)
        url.searchParams.append('client_id',client_id)
        url.searchParams.append('scope',scopes.join(' '))
        if(!open(url,'_blank')){
            throw new Error('failed to open authorization window')
        }
        return new Promise(function(resolve,reject){
            addEventListener("message",function onMessage(event){
                if(!(event.origin===new URL(import.meta.url).origin)){
                    return
                }
                removeEventListener('message',onMessage)
                if('code' in event.data){
                    resolve(event.data)
                }else{
                    reject(event.data)
                }
            })
        })
    }

    /**
     * https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#use-the-authorization-code-to-get-a-token
     * @param {String} client_id 
     * @param {String} code 
     * @returns {Promise<TwitchToken>}
     */
    static exchangeCode(client_id,code){
        console.debug('exchanging authorization code')
        const searchParams=new URLSearchParams({
            client_id:client_id,
            code:code,
            grant_type:'authorization_code'
        })
        return fetch(this.#proxy_uri,{
            method:'POST',
            body:searchParams.toString()+'&redirect_uri='+this.#redirect_uri,
            headers:{'content-type':'application/x-www-form-urlencoded'}
        }).then(async function(response){
            if(!response.ok){
                throw await response.json()
            }
            return await response.json()
        })
    }

    /**
     * https://dev.twitch.tv/docs/authentication/validate-tokens/#how-to-validate-a-token
     * @param {String} access_token 
     * @returns {Promise<TwitchToken>}
     */
    static validateToken(access_token){
        console.debug('validating token')
        return fetch('https://id.twitch.tv/oauth2/validate',{
            headers:{authorization:'OAuth '+access_token}
        }).then(async response=>{
            if(!response.ok){
                throw await response.json()
            }
            return await response.json()
        })
    }

    /**
     * https://dev.twitch.tv/docs/authentication/refresh-tokens/#how-to-use-a-refresh-token
     * @param {String} client_id 
     * @param {String} refresh_token 
     * @returns {Promise<TwitchToken>}
     */
    static refreshToken(client_id,refresh_token){
        console.debug('refreshing token')
        const searchParams=new URLSearchParams({
            client_id:client_id,
            grant_type:'refresh_token',
            refresh_token:refresh_token
        })
        return fetch(this.#proxy_uri,{
            method:'POST',
            body:searchParams.toString(),
            headers:{'content-type':'application/x-www-form-urlencoded'}
        }).then(async function(response){
            if(!response.ok){
                throw await response.json()
            }
            return await response.json()
        })
    }

    /**
     * validate, update, and return an existing token
     * @param {TwitchToken} token 
     * @returns {Promise<TwitchToken>}
     */
    static getTokenWithValidation(token){
        return this.validateToken(token.access_token)
        .then(validation=>{
            Object.assign(validation,token)
            validation.obtainment_timestamp=Date.now()
            return validation
        })
    }

    constructor(client_id){
        this.client_id=client_id
    }

    /**
     * get the cached token
     * @returns {Promise<TwitchToken>}
     */
    async getLocalToken(user_id=await localStorage.key(0)){
        const data=await localStorage.getItem(user_id)||globalThis.localStorage.getItem(import.meta.url)
        if(!data){
            return null
        }
        return JSON.parse(data)
    }

    async getAppToken(){
        let token=await this.getLocalToken(this.client_id)
        if(!token){
            token=TwitchAuth.getAppToken(this.client_id)
            token=await this.setToken(token)
        }
        return token
    }

    /**
     * Remove twitch tokens from browser storage.
     * If localforage didn't fail to load, erases all tokens.
     * Otherwise, only the legacy token key and app token key are erased by default.
     * Additional options are availible in this case to specify extra steps.
     * @param {boolean} clearLocalStorage If not using localforage, set this to true to clear localStorage entirely, erasing all tokens and possibly unrelated data
     * @param  {...string} user_ids If not using localforage, the user ids for which to remove their tokens
     * @returns {Promise<void>} resolves after all tokens have been removed
     */
    async resetLocalTokens(clearLocalStorage=false,...user_ids){
        if(localStorage!==globalThis.localStorage){
            globalThis.localStorage.removeItem(import.meta.url)
            return localStorage.clear()
        }else{
            if(clearLocalStorage){
                localStorage.clear()
            }else{
                localStorage.removeItem(import.meta.url)
                localStorage.removeItem(this.client_id)
                for(const user_id of user_ids){
                    localStorage.removeItem(user_id)
                }
            }
        }
    }

    /**
     * Do whatever it takes to get a token
     * @param {Array<String>} scopes 
     * @returns {Promise<TwitchToken>}
     */
    async getToken(...scopes){
        const token=await this.getLocalToken()
        if(!token){
            console.debug('no local token, requesting new token')
            return this.getNewToken(...scopes)
        }
        scopes=scopes.join(' ').split(' ')
        for(const scope of scopes){
            if(scope===''){
                continue
            }
            if(!token.scope.includes(scope)){
                console.debug('token is missing '+scope+', requesting new token')
                return this.getNewToken(...scopes)
            }
        }
        const expiry=token.obtainment_timestamp+(token.expires_in*1000)-(60*1000)
        if(expiry<Date.now()){
            return this.getFreshToken(token)
        }
        return token
    }

    /**
     * Interactively request a new token
     * @param {Array<String>} scopes 
     * @returns {Promise<TwitchToken>}
     */
    getNewToken(...scopes){
        return TwitchAuth.requestAuthCode(this.client_id,...scopes)
        .then(response=>TwitchAuth.exchangeCode(this.client_id,response.code))
        .then(this.setToken)
    }

    /**
     * Non-interactively request a new token, falling back to interactive mode
     * @param {TwitchToken} token 
     * @returns {Promise<TwitchToken>}
     */
    getFreshToken(token){
        return TwitchAuth.refreshToken(this.client_id,token.refresh_token)
        .then(this.setToken).catch((error)=>{
            console.warn(error)
            return this.getNewToken(...token.scope)
        })
    }

    /**
     * validate, update, store, and return an existing token
     * @param {TwitchToken} token 
     * @returns {Promise<TwitchToken>}
     */
    setToken(token){
        return TwitchAuth.getTokenWithValidation(token)
        .then(token=>{
            localStorage.setItem(token.user_id||this.client_id,JSON.stringify(token))
            return token
        })
    }
}