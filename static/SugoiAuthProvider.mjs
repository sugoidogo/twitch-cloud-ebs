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
        return TwitchAuth.getUserToken(this.clientId,...scopes).then(getTwurpleProxy)
    }

    /**
     * use an existing token
     * @param {import("./TwitchAuth.mjs").TwitchToken} token 
     * @returns {import("./TwitchAuth.mjs").TwitchToken}
     */
    addUserForToken(token){
        if(token.refresh_token){
            return TwitchAuth.refreshToken(token.refresh_token).then(getTwurpleProxy)
        }
        return TwitchAuth.validateToken(token.access_token).then(getTwurpleProxy)
    }

    removeUser(){
        this.#token=null
    }

    /**
     * @param {String|Number} user 
     * @param {String[][]} scopeSets
     * @returns {Promise<import("./TwitchAuth.mjs").TwitchToken | null>}
     */
    getAccessTokenForUser(user,...scopeSets){
        for(const scopes of scopeSets){
            if(hasScopes(this.#token,scopes)){
                return this.#token
            }
        }
        return this.addUser(...scopeSets[0])
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
    refreshAccessTokenForUser(user){
        return TwitchAuth.refreshToken(this.#token.refresh_token)
    }
}