import * as TwitchAuth from "./TwitchAuth.mjs";

function getTwurpleProxy(token){
    return new Proxy(token,{
        get(target, name, receiver){
            return target[name.toString().replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)]
        }
    })
}

/**
 * @param {import("./TwitchAuth.mjs").TwitchToken} token 
 * @param  {...string} scopes 
 */
function hasScopes(token,...scopes){
    for(const scope of scopes){
        if(!token.scope.includes(scope)){
            return false
        }
    }
    return true
}

export default class SugoiAuthProvider {

    /** @type {TwitchToken} */
    #token;

    /** @type {String} */
    clientId;

    constructor(client_id){
        this.clientId=client_id
    }

    /**
     * get a new token
     * @param  {String[]} scopes 
     * @returns {Promise<import("./TwitchAuth.mjs").TwitchToken>}
     */
    async addUser(...scopes){
        if(hasScopes(this.#token,scopes)){
            return this.#token
        }
        this.#token=await TwitchAuth.getUserToken(this.clientId,...scopes).then(getTwurpleProxy)
        return this.#token
    }

    /**
     * use an existing token
     * @param {import("./TwitchAuth.mjs").TwitchToken} token 
     * @returns {import("./TwitchAuth.mjs").TwitchToken}
     */
    async addUserForToken(token){
        if(token.refresh_token){
            this.#token=await TwitchAuth.refreshToken(token.refresh_token).then(getTwurpleProxy)
            return this.#token
        }
        this.#token=await TwitchAuth.validateToken(token.access_token).then(getTwurpleProxy)
        return this.#token
    }

    removeUser(){
        this.#token=null
    }

    /**
     * @param {String|Number} user 
     * @param {String[][]} scopeSets
     * @returns {Promise<import("./TwitchAuth.mjs").TwitchToken | null>}
     */
    async getAccessTokenForUser(user,...scopeSets){
        for(const scopes of scopeSets){
            if(hasScopes(this.#token,scopes)){
                return this.#token
            }
        }
        this.#token=await this.addUser(...scopeSets[0]).then(getTwurpleProxy)
        return this.#token
    }

    /**
     * @param {String|Number} user 
     * @returns {Promise<import("./TwitchAuth.mjs").TwitchToken>}
     */
    getAnyAccessToken(user){
        return this.#token || TwitchAuth.getAppToken(this.clientId)
    }

    /**
     * @param {String|Number} user 
     * @returns {String[]}
     */
    getCurrentScopesForUser(user){
        return this.#token.scope
    }

    /**
     * @param {String|Number} user 
     * @returns {Promise<import("./TwitchAuth.mjs").TwitchToken>}
     */
    async refreshAccessTokenForUser(user){
        this.#token=await TwitchAuth.refreshToken(this.#token.refresh_token)
        return this.#token
    }
}