try{
    const sentry=await import('https://cdn.jsdelivr.net/npm/@sentry/browser@8/+esm')
    sentry.init({
        dsn:'https://1982d0155a1144f4a8c5bac6578572e7@app.glitchtip.com/8990',
        environment:location.hostname,
        release:"8.1.0"
    })
}catch(e){
    console.warn('automatic error reporting failed to load',e)
}

/** @param {Response} response */
async function validateResponse(response){
    if(!response.ok){
        throw new Error(response.status+' '+response.url+' '+await response.text())
    }
    return response
}

export function request_auth(client_id,scope,redirect_uri=location.origin+location.pathname){
    const url=new URL('https://id.twitch.tv/oauth2/authorize')
    url.search=new URLSearchParams({
        client_id:client_id,
        response_type:'code',
        scope:scope
    })
    const dialog=document.createElement('dialog')
    dialog.innerHTML='Redirecting you to Twitch for authorization<br>'
    dialog.innerHTML+='If you see this multiple times, please report it as a bug<br>'
    const okButton=document.createElement('button')
    okButton.innerHTML='OK'
    okButton.onclick=()=>location.assign(url.href+'&redirect_uri='+redirect_uri)
    dialog.appendChild(okButton)
    const cancelButton=document.createElement('button')
    cancelButton.innerHTML='Cancel'
    cancelButton.onclick=()=>dialog.close()
    dialog.appendChild(cancelButton)
    document.body.appendChild(dialog)
    dialog.showModal()
    //if(window.confirm((document.title||location.origin+location.pathname)+' redirecting you to twitch for authorization')){
    //    location.assign(url.href+'&redirect_uri='+redirect_uri)
    //}
}

export function get_url_params(){
    return Object.fromEntries(new URLSearchParams(location.search))
}

export function fetch_tokens(client_id,code,redirect_uri=location.origin+location.path){
    const url=new URL('/oauth2/token',import.meta.url)
    const body=new URLSearchParams({
        client_id:client_id,
        code:code,
        grant_type:'authorization_code',
        redirect_uri:redirect_uri
    }).toString()
    return fetch(url.href,{
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:body
    })
    .then(validateResponse)
    .then(response=>response.json())
}

export function get_headers(tokens){
    return {
        'Authorization':'Bearer '+tokens.access_token,
        'Client-ID':tokens.client_id
    }
}

export function validate_tokens(tokens){
    const url=new URL('https://id.twitch.tv/oauth2/validate')//,import.meta.url)
    return fetch(url,{headers:{
        'Authorization':'OAuth '+tokens.access_token
    }}).then(validateResponse)
    .then(response=>response.json())
    .then(validation=>{
        if('message' in validation){
            throw new Error(validation.message)
        }
        Object.assign(tokens,validation)
        delete tokens.scope
        return tokens
    })
}

export function set_local_tokens(client_id,tokens){
    localStorage.setItem(client_id,JSON.stringify(tokens))
    return tokens
}

export function get_local_tokens(client_id){
    return JSON.parse(localStorage.getItem(client_id))
}

export function refresh_tokens(client_id,refresh_token){
    const url=new URL('/oauth2/token',import.meta.url)
    const body=new URLSearchParams({
        client_id:client_id,
        grant_type:'refresh_token',
        refresh_token:refresh_token
    }).toString()
    return fetch(url.href,{
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:body
    })
    .then(validateResponse)
    .then(response=>response.json())
}

export function set_refresh_timeout(client_id,tokens){
    return setTimeout(()=>{
        get_tokens(client_id)
        .then(new_tokens=>Object.assign(tokens,new_tokens))
    },tokens.expires_in*1000)
}

export async function get_tokens(client_id,scope=null,redirect_uri=location.origin+location.pathname,auth_return=false){
    let tokens=get_local_tokens(client_id)||get_url_params()
    if('code' in tokens){
        tokens=await fetch_tokens(client_id,tokens.code,redirect_uri)
        .catch((error)=>console.warn(error))
    }
    if(!tokens){
        tokens={refresh_token:undefined}
    }
    return refresh_tokens(client_id,tokens.refresh_token)
    .then(validate_tokens)
    .then(tokens=>{
        tokens.auth_headers=get_headers(tokens)
        set_refresh_timeout(client_id,tokens)
        return set_local_tokens(client_id,tokens)
    })
    .catch(async (error)=>{
            if(error.message==="Failed to fetch"){
                await new Promise(function(resolve,reject){
                    setTimeout(resolve,1000)
                })
                return get_tokens(client_id,scope,redirect_uri,auth_return)
            }
            if(scope){
                request_auth(client_id,scope,redirect_uri)
            }else{
                const dialog=document.createElement('dialog')
                dialog.innerHTML=(document.title||location.origin+location.pathname)+' has been logged out of your twitch account<br>'
                const okButton=document.createElement('button')
                okButton.innerHTML='OK'
                okButton.onclick=()=>dialog.close()
                dialog.appendChild(okButton)
                document.body.appendChild(dialog)
                dialog.showModal()
                localStorage.clear(client_id)
            }
            throw error
        })
}

export default get_tokens