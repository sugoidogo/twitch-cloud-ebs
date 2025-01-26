import * as TwitchAuth from './TwitchAuth.mjs'
/** @type {import('./TwitchAuth.mjs').TwitchToken} */
let token=null;

export function request_auth(client_id,scope,redirect_uri=location.origin+location.pathname){
    return TwitchAuth.requestAuthCode(client_id,...scope.split(' '))
}

export function get_url_params(){
    return Object.fromEntries(new URLSearchParams(location.search))
}

export async function fetch_tokens(client_id,code,redirect_uri=location.origin+location.path){
    client_id=client_id
    token=await TwitchAuth.exchangeCode(client_id,code)
    token.client_id=client_id
    return token
}

export function get_headers(tokens){
    return {
        'Authorization':'Bearer '+token.access_token,
        'Client-ID':token.client_id
    }
}

export async function validate_tokens(tokens){
    const validation=await TwitchAuth.validateToken(tokens.access_token)
    Object.assign(tokens,validation)
    tokens.scope=validation.scopes
    token=tokens
    return token
}

export function set_local_tokens(client_id,tokens){
    token=tokens
    return token
}

export function get_local_tokens(client_id){
    return token
}

export async function refresh_tokens(client_id,refresh_token){
    token=await TwitchAuth.refreshToken(client_id,refresh_token)
    return token
}

export function set_refresh_timeout(client_id,tokens){
    return setTimeout(()=>{
        TwitchAuth.refreshToken(client_id,tokens.refresh_token)
        .then(new_tokens=>Object.assign(tokens,new_tokens))
    },tokens.expires_in*999)
}

export async function get_tokens(client_id,scope=null,redirect_uri=location.origin+location.pathname,auth_return=false){
    token=await TwitchAuth.getUserToken(client_id,...scope.split(' ')).then(validate_tokens)
    set_refresh_timeout(client_id,token)
    return token
}

export default get_tokens