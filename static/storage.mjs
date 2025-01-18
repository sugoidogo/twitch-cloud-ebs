import localforage from 'https://cdn.jsdelivr.net/npm/localforage/+esm'

export default class WebStorage {
    constructor(authProvider,userID,isPublic=false){
        this.authProvider=authProvider
        this.userID=userID
        let prefix='private.'
        if(isPublic){
            prefix='public.'
        }
        /** @type {Storage} */
        this.storage=localforage.createInstance({name:prefix+authProvider.clientId+'.'+import.meta.url})
    }

    #getURL(path){
        const url=new URL(path,import.meta.url)
        url.searchParams.append('public',this.isPublic)
        return url
    }

    async #getHeaders(){
        const token=await this.authProvider.getAccessTokenForUser(this.userID)
        return {authorization:'OAuth '+token.accessToken}
    }

    get length(){
        return this.storage.length
    }

    key(n){
        return this.storage.key(n)
    }

    async getItem(path){
        const url=this.#getURL(path)

        return fetch(url,{headers:await this.#getHeaders()}).then(async response=>{
            if(!response.ok){
                throw 'failed to fetch'
            }else{
                response.clone().blob().then(blob=>{
                    this.storage.setItem(path,blob)
                })
                return response
            }
        }).catch(async ()=>{
            const data=await this.storage.getItem(path)
            if(!data){
                return new Response(null,{status:404})
            }else{
                return new Response(data)
            }
        })
    }

    async setItem(path,data){
        const url=this.#getURL(path)

        this.storage.setItem(path,data)
        return fetch(url,{method:'PUT',body:data,headers:await this.#getHeaders(),keepalive:true})
    }

    async removeItem(path){
        const url=this.#getURL(path)
 
        this.storage.removeItem(path)//TODO the server is recursive, but this library is not
        return fetch(url,{method:'DELETE',headers:await this.#getHeaders(),keepalive:true})
    }

    async clear(){
        this.clearCache()

        const url=this.#getURL('/')
        return fetch(url,{method:'DELETE',headers:await this.#getHeaders(),keepalive:true})
    }

    clearCache(){
        this.storage.clear()
    }

    async sync(){
        await fetch(this.#getURL('/'),{method:'DELETE',headers:await this.#getHeaders()})
        const promises=[]
        for(let i;i<this.storage.length;i++){
            const path=this.storage.key(i)
            const data=await this.storage.getItem(path)
            const url=this.#getURL(path)
            let promise=fetch(url,{method:'POST',headers:await this.#getHeaders(),data:data,keepalive:true})
            promises.push(promise)
        }
        return Promise.all(promises)
    }

}