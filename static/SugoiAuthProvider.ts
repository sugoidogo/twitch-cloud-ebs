import * as TwitchAuth from "./TwitchAuth.ts";
import { AccessTokenMaybeWithUserId, AuthProvider, AccessToken, AccessTokenWithUserId } from "@twurple/auth";

type Token = TwitchAuth.TwitchToken & AccessTokenMaybeWithUserId

function getTwurpleProxy(token: TwitchAuth.TwitchToken): Token {
    return new Proxy(token, {
        get(target, name, receiver) {
            return target[name.toString().replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)]
        }
    }) as Token
}

function hasScopes(token: Token, ...scopes: string[]) {
    if (!token) {
        return false
    }
    if (!scopes) {
        return true
    }
    for (const scope of scopes) {
        if (!token.scope.includes(scope)) {
            return false
        }
    }
    return true
}

export default class SugoiAuthProvider implements AuthProvider {

    #token: Token
    clientId: string;

    constructor(client_id: string) {
        this.clientId = client_id
    }

    #setToken = (token: Token) => {
        this.#token = token
        return token
    }

    async addUser(...scopes: string[]) {
        this.#token = await TwitchAuth.getUserToken(this.clientId, ...scopes).then(getTwurpleProxy).then(this.#setToken)
        return this.#token
    }

    async addUserForToken(token: TwitchAuth.TwitchToken) {
        if (token.refresh_token) {
            this.#token = await TwitchAuth.refreshToken(this.clientId, token.refresh_token).then(getTwurpleProxy).then(this.#setToken)
            return this.#token
        }
        this.#token = await TwitchAuth.validateToken(token.access_token).then(getTwurpleProxy).then(this.#setToken)
        return this.#token
    }

    removeUser() {
        this.#token = null
    }

    async getAccessTokenForUser(user: string | number, ...scopeSets: string[][]) {
        if ((!scopeSets[0]) && (this.#token)) {
            return this.#token as AccessTokenWithUserId
        }
        for (const scopes of scopeSets) {
            if (hasScopes(this.#token, ...scopes)) {
                return this.#token as AccessTokenWithUserId
            }
        }
        this.#token = await TwitchAuth.getUserTokenPassive(this.clientId, ...(scopeSets[0] || [])).then(getTwurpleProxy).then(this.#setToken)
        return this.#token as AccessTokenWithUserId
    }

    async getAnyAccessToken(user: string | number) {
        return this.#token || TwitchAuth.getAppToken(this.clientId).then(getTwurpleProxy)
    }

    getCurrentScopesForUser(user: string | number) {
        if (!this.#token || this.#token instanceof Promise) {
            return []
        }
        return this.#token.scope
    }

    async refreshAccessTokenForUser(user: string | number) {
        this.#token = await TwitchAuth.refreshToken(this.clientId, this.#token.refresh_token).then(this.#setToken)
        return this.#token as AccessTokenWithUserId
    }
}