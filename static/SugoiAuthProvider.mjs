import TwitchAuth from "./TwitchAuth.mjs";

function getTwurpleProxy(token){
    return new Proxy(token,{
        get(target, name, receiver){
            return target[name.toString().replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)]
        }
    })
}

export default class SugoiAuthProvider {

    /** @type {TwitchAuth} */
    #auth;

    /** @type {String} */
    clientId;

    constructor(client_id){
        this.#auth=new TwitchAuth(client_id)
        this.clientId=client_id
    }

    /**
     * @param  {String[]} scopes 
     * @returns {Promise<import("./TwitchAuth.mjs").TwitchToken>}
     */
    addUser(...scopes){
        return this.#auth.getToken(...scopes).then(getTwurpleProxy)
    }

    addUserForToken(token){
        return this.#auth.setToken(token).then(getTwurpleProxy)
    }

    removeUser(){
        return this.#auth.resetLocalToken()
    }

    /**
     * @param {String|Number} user 
     * @param {String[][]} scopeSets
     * @returns {Promise<import("./TwitchAuth.mjs").TwitchToken | null>}
     */
    getAccessTokenForUser(user,...scopeSets){
        const scopes=new Set()
        for(const scopeSet of scopeSets){
            for(const scope of scopeSet){
                scopes.add(scope)
            }
        }
        return this.#auth.getToken(...scopes).then(getTwurpleProxy)
        .then(token=>{
            if(token.user_id!=user){
                throw 'got access token for wrong user'
            }
            return token
        }).catch(error=>{
            console.warn(error)
            return null
        })
    }

    /**
     * @param {String|Number} user 
     * @returns {Promise<import("./TwitchAuth.mjs").TwitchToken>}
     */
    getAnyAccessToken(user){
        return this.#auth.getToken().then(getTwurpleProxy)
        .then(token=>{
            if(token.user_id!=user){
                throw 'got access token for wrong user'
            }
            return token.then(getTwurpleProxy)
        }).catch(error=>{
            return this.#auth.getAppToken().then(getTwurpleProxy)
        })
    }

    /**
     * @param {String|Number} user 
     * @returns {String[]}
     */
    getCurrentScopesForUser(user){
        return this.#auth.getLocalToken().scope
    }

    /**
     * @param {String|Number} user 
     * @returns {Promise<import("./TwitchAuth.mjs").TwitchToken>}
     */
    refreshAccessTokenForUser(user){
        const token=this.#auth.getLocalToken()
        if(token.user_id!=user){
            throw 'got access token for wrong user'
        }
        return this.#auth.getFreshToken(token).then(getTwurpleProxy)
    }
}