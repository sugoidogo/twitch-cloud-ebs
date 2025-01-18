import TwitchAuth from "./TwitchAuth-localforage.mjs";

/**
 * Represents the data of an OAuth access token returned by Twitch, together with the ID of the user it represents, if it's not an app access token
 */
export class AccessTokenMaybeWithUserId {

    /**
     * @type {import("./TwitchAuth-localforage.mjs").TwitchToken}
     */
    #token;

    /**
     * Create a Twrple-compatible "AccessTokenMaybeWithUserID" object from a TwitchToken
     * @param {import("./TwitchAuth-localforage.mjs").TwitchToken} token 
     */
    constructor(token){
        this.#token=token
    }

    /**
     * The access token which is necessary for every request to the Twitch API
     * @type {string}
     */
    get accessToken(){return this.#token.access_token}

    /**
     * The time, in seconds from the obtainment date, when the access token expires
     * @type {number | null}
     */
    get expiresIn(){return this.#token.expires_in}

    /**
     * The date when the token was obtained, in epoch milliseconds
     * @type {number}
     */
    get obtainmentTimestamp(){return this.#token.obtainment_timestamp}

    /**
     * The refresh token which is necessary to refresh the access token once it expires
     * @type {string | null}
     */
    get refreshToken(){return this.#token.refresh_token}

    /**
     * The scope the access token is valid for, i.e. what the token enables you to do
     * @type {string[]}
     */
    get scope(){return this.#token.scope}
    
    /**
     * The ID of the user represented by the token, or undefined if it's an app access token
     */
    get userId(){return this.#token.user_id}
}

export default class SugoiAuthProvider {

    /**
     * @type {string}
     */
    clientId;
    /**
     * @type {TwitchAuth}
     */
    #auth;
    /**
     * @type {Map<String,import("./TwitchAuth-localforage.mjs").TwitchToken>}
     */
    #cache;

    constructor(clientId){
        this.clientId=clientId
        this.#auth=new TwitchAuth(clientId)
        this.#cache=new Map
    }

    /**
     * Fetches a token for the user
     * @param {string | number} user The user to fetch a token for
     * @param  {...string[]} scopeSets zero or more scope arrays in order of preference
     * @returns {Promise<AccessTokenMaybeWithUserId | null>}
     */
    async getAccessTokenForUser(user,...scopeSets){
        let token=await this.#auth.getLocalToken(user)
        if(token){
            if(scopeSets.length===0){
                this.#cache.set(user,token)
                return new AccessTokenMaybeWithUserId(token)
            }
            scopeSets:for(const scopeSet of scopeSets){
                for(const scope of scopeSet){
                    if(!token.scope.includes(scope)){
                        continue scopeSets;
                    }
                }
                this.#cache.set(user,token)
                return new AccessTokenMaybeWithUserId(token)
            }
        }
        token=await this.#auth.getToken(scopeSets[0])
        this.#cache.set(user,token)
        return new AccessTokenMaybeWithUserId(token)
    }

    /**
     * Fetches an app token
     * @param {boolean} forceNew Whether to always get a new token, even if the old one is still deemed valid internally
     * @returns {Promise<AccessTokenMaybeWithUserId>}
     */
    async getAppAccessToken(forceNew=false){
        if(forceNew){
            let token=TwitchAuth.getAppToken(this.clientId)
            token=this.#auth.setToken(token)
            return new AccessTokenMaybeWithUserId(token)
        }
        const token=await this.#auth.getAppToken()
        return new AccessTokenMaybeWithUserId(token)
    }

    /**
     * Fetches any token to use with a request that supports both user and app tokens
     * @param {string | number} user The user to fetch a token for
     * @returns {Promise<AccessTokenMaybeWithUserId>}
     */
    async getAnyAccessToken(user=undefined){
        let token;
        if(user){//only call this function for a user token, because the next function will already call this for no user token
            token=this.#auth.getLocalToken(user)
        }
        if(!token){
            token=this.getAppAccessToken()
        }
        return token
    }

    /**
     * Gets the scopes that are currently available using the access token for a user.
     * The underlying local token storage is async, but this interface must be sync,
     * so this function only works for already retreived tokens via in-memory caching.
     * @param {string | number} user The user id to get scopes for
     * @returns {string[]}
     */
    getCurrentScopesForUser(user){
        if(this.#cache.has(user)){
            return this.#cache.get(user).scope
        }else{
            return []
        }
    }
    /**
     * Requests that the provider fetches a new token from Twitch for the given user
     * @param {string | number} user The user id to fetch a token for
     */
    async refreshAccessTokenForUser(user){
        let token=await this.#auth.getLocalToken(user)
        token=await TwitchAuth.refreshToken(this.clientId,token.refresh_token)
        this.#cache.set(user,token)
        return new AccessTokenMaybeWithUserId(token)
    }
}