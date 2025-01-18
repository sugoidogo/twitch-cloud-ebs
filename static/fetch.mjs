import localforage from 'https://cdn.jsdelivr.net/npm/localforage/+esm'
/** @type {Storage} */
const cache=localforage.createInstance({name:import.meta.url})
// make sure we don't lose the bultin fetch
const fetch=window.fetch

/**
 * `fetch` with an infinite cache
 * @param {RequestInfo} resource 
 * @param {RequestInit} options 
 * @returns {Promise<Response>}
 */
export default async function fetchCached(resource,options={}){
    if('body' in options){
        cache.setItem(resource.toString(),options.body)
        return fetch(resource,options)
    }
    if('method' in options && options.method==='DELETE'){
        cache.removeItem(resource.toString())
    }
    return fetch(resource,options).then(async response=>{
        if(!response.ok){
            throw response
        }
        cache.setItem(resource,await response.clone().blob())
        return response
    }).catch(async error=>{
        const body=await cache.getItem(resource.toString())
        if(body){
            return new Response(body)
        }
        if(error instanceof Response){
            return error
        }
        throw error
    })
}