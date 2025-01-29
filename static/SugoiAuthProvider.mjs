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
    if(!token){
        return false
    }
    if(!scopes){
        return true
    }
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

    #setToken=(token)=>{
                this.#token=token
        return token
    }

    /**
     * get a new token
     * @param  {String[]} scopes 
     * @returns {Promise<import("./TwitchAuth.mjs").TwitchToken>}
     */
    async addUser(...scopes){
        this.#token=TwitchAuth.getUserToken(this.clientId,...scopes).then(getTwurpleProxy).then(this.#setToken)
        return this.#token
    }

    /**
     * use an existing token
     * @param {import("./TwitchAuth.mjs").TwitchToken} token 
     * @returns {import("./TwitchAuth.mjs").TwitchToken}
     */
    async addUserForToken(token){
        if(token.refresh_token){
            this.#token=TwitchAuth.refreshToken(token.refresh_token).then(getTwurpleProxy).then(this.#setToken)
            return this.#token
        }
        this.#token=TwitchAuth.validateToken(token.access_token).then(getTwurpleProxy).then(this.#setToken)
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
        if((!scopeSets[0]) && (this.#token)){
            return this.#token
        }
        for(const scopes of scopeSets){
            if(hasScopes(this.#token,scopes)){
                return this.#token
            }
        }
        this.#token=TwitchAuth.getUserTokenPassive(...(scopeSets[0]||[])).then(getTwurpleProxy).then(this.#setToken)
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
        if(!this.#token || this.#token instanceof Promise){
            return []
        }
        return this.#token.scope
    }

    /**
     * @param {String|Number} user 
     * @returns {Promise<import("./TwitchAuth.mjs").TwitchToken>}
     */
    async refreshAccessTokenForUser(user){
        this.#token=TwitchAuth.refreshToken(this.#token.refresh_token).then(this.#setToken)
        return this.#token
    }
}