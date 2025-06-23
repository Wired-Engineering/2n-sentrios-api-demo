const axios = require('axios');
const crypto = require('crypto');

function parseWWWAuthenticate(authHeader) {
    const parts = {};
    const regex = /(\w+)=["']?([^"',]+)["']?/g;
    let match;
    
    while ((match = regex.exec(authHeader)) !== null) {
        parts[match[1]] = match[2];
    }
    
    return parts;
}

function generateDigestResponse(username, password, method, uri, authParams) {
    const ha1 = crypto.createHash('md5').update(`${username}:${authParams.realm}:${password}`).digest('hex');
    const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
    
    let response;
    if (authParams.qop === 'auth') {
        const nc = '00000001';
        const cnonce = crypto.randomBytes(8).toString('hex');
        response = crypto.createHash('md5').update(
            `${ha1}:${authParams.nonce}:${nc}:${cnonce}:${authParams.qop}:${ha2}`
        ).digest('hex');
        
        return {
            response,
            nc,
            cnonce,
            qop: authParams.qop
        };
    } else {
        response = crypto.createHash('md5').update(`${ha1}:${authParams.nonce}:${ha2}`).digest('hex');
        return { response };
    }
}

function createDigestAuthHeader(username, uri, authParams, digestData) {
    let authHeader = `Digest username="${username}", realm="${authParams.realm}", nonce="${authParams.nonce}", uri="${uri}", response="${digestData.response}"`;
    
    if (authParams.opaque) {
        authHeader += `, opaque="${authParams.opaque}"`;
    }
    
    if (digestData.qop) {
        authHeader += `, qop="${digestData.qop}", nc="${digestData.nc}", cnonce="${digestData.cnonce}"`;
    }
    
    return authHeader;
}

async function makeDigestRequest(url, method = 'GET', data = null, username, password, timeout = 5000, responseType = 'json') {
    try {
        const initialResponse = await axios({
            method,
            url,
            data,
            timeout,
            responseType: responseType,
            httpsAgent: new (require('https').Agent)({
                rejectUnauthorized: false
            }),
            validateStatus: (status) => status === 401 || (status >= 200 && status < 300)
        });
        
        if (initialResponse.status === 401) {
            const authHeader = initialResponse.headers['www-authenticate'];
            if (!authHeader || !authHeader.includes('Digest')) {
                throw new Error('Server does not support digest authentication');
            }
            
            const authParams = parseWWWAuthenticate(authHeader);
            const urlObj = new URL(url);
            const uri = urlObj.pathname + urlObj.search;
            
            const digestData = generateDigestResponse(username, password, method, uri, authParams);
            const digestAuthHeader = createDigestAuthHeader(username, uri, authParams, digestData);
            
            const authenticatedResponse = await axios({
                method,
                url,
                data,
                timeout,
                responseType: responseType,
                httpsAgent: new (require('https').Agent)({
                    rejectUnauthorized: false
                }),
                headers: {
                    'Authorization': digestAuthHeader
                }
            });
            
            return authenticatedResponse;
        }
        
        return initialResponse;
    } catch (error) {
        if (error.response) {
            throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
        }
        throw error;
    }
}

module.exports = {
    makeDigestRequest
};