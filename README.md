# Twitch Cloud EBS
This is a server-side component providing cloud storage and [OAuth Code Grant Flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow) access to otherwise client-side only software.

## Deploying

### Cloudflare Workers

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fsugoidogo%2Ftwitch-cloud-ebs)

### Docker

This worker requires that the KV store is pre-populated with client-id keys and client-secret values, but doesn't provide any mechanism for this to work with selflare. As such, the docker container may not be usable until this is resolved. PRs are welcome.

This worker is also availible as a docker container at [ghcr.io/sugoidogo/twitch-cloud-ebs](https://github.com/sugoidogo/twitch-clips-consent-api/pkgs/container/twitch-clips-consent-api).
It listens on HTTP port 8080 and requires mounts for `/worker/cache`, `/worker/kv`, `/worker/d1`, and `/worker/r2`. 
The r2 and kv mounts are the only ones actually used, but the selflare runtime requires all of them regardless.

## Twurple Module

This API provides two Twurple modules, one for authorization and one for storage, allowing for easy integration if you're already using the Twurple javascript library.
the WebStorage module can be used to cache fetched resources from anywhere, but when used as demonstrated below, allows your client to maintain access to previously stored resources from cloud storage via the browser's CacheStorage API.

<details><summary>javascript</summary>

```javascript
import SugoiAuthProvider from 'https://ebs.domain.com/SugoiAuthProvider.js'
import WebStorage from 'https://ebs.domain.com/WebStorage.js'
import { ApiClient } from '@twurple/api';

const authProvicder=new SugoiAuthProvider('your-client-id')
const webStorage=new WebStorage(authProvider)
const apiClient = new ApiClient({ authProvider });

const config=await webStorage.fetch('config.json').then(response=>response.json())
```

</details>

## Usage

### `/oauth2/token`

This endpoint is a proxy to `https://id.twitch.tv/oauth2/token` that adds the `client_secret` to your request body, in order to allow your client software to get a refresh token using the [OAuth Code Grant Flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow) without exposing your client secret to end user devices. When this software was written, this was the only way to get a refresh token, and remains the only way to get a non-expiring refresh token, however Twitch has now added the [Device Code Grant Flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow) which grants you a refresh token that expires 30 days after refreshing. Consider if this new flow is acceptable for your application before using this endpoint.

### Storage

All locations outside of `/oauth` or the provided javascript modules are part of the storage API, which allows you to `GET`, `PUT`, or `DELETE` files from cloud storage, scoped to the client-id and user-id of the token provided in the `authorization` header, which uses the same authorization scheme as the Twitch API.