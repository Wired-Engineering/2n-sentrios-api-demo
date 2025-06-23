var express = require('express')
const { getConfig, addSentrio, removeSentrio } = require('../config');
const { makeDigestRequest } = require('../auth');

const sentryStatusCache = new Map();

async function fetchSentrios(req, res, next) {
    try {
        const config = getConfig();
        const { username, password } = config.auth;
        
        // For the home page route, load immediately with cached status
        if (req.route && req.route.path === '/') {
            const results = [];
            for (const sentrio of config.sentrios) {
                const cached = sentryStatusCache.get(sentrio.ip);
                results.push({
                    ip: sentrio.ip,
                    name: sentrio.name,
                    status: cached ? cached.status : 'unknown',
                    lastUpdate: cached ? cached.lastUpdate : null
                });
            }
            res.locals.sentrios = results;
            
            // Start background health check
            setImmediate(() => backgroundHealthCheck(config.sentrios, username, password));
            return next();
        }
        
        // For API endpoint, do live check
        const results = [];
        for (const sentrio of config.sentrios) {
            try {
                const response = await makeDigestRequest(
                    `https://${sentrio.ip}/api/system/status`,
                    'GET',
                    null,
                    username,
                    password,
                    3000 // 3 second timeout
                );
                
                results.push({
                    ip: sentrio.ip,
                    name: sentrio.name,
                    status: response.data.success ? 'online' : 'offline',
                    data: response.data
                });
                
                sentryStatusCache.set(sentrio.ip, {
                    status: response.data.success ? 'online' : 'offline',
                    lastUpdate: new Date()
                });
                
            } catch (error) {
                results.push({
                    ip: sentrio.ip,
                    name: sentrio.name,
                    status: 'offline',
                    error: error.message
                });
                
                sentryStatusCache.set(sentrio.ip, {
                    status: 'offline',
                    lastUpdate: new Date()
                });
            }
        }
        
        res.json({ success: true, sentrios: results });
    } catch (error) {
        if (req.route && req.route.path === '/sentrios') {
            res.status(500).json({ success: false, error: error.message });
        } else {
            res.locals.sentrios = [];
            next();
        }
    }
}

async function backgroundHealthCheck(sentrios, username, password) {
    for (const sentrio of sentrios) {
        try {
            const response = await makeDigestRequest(
                `https://${sentrio.ip}/api/system/status`,
                'GET',
                null,
                username,
                password,
                3000 // 3 second timeout
            );
            
            sentryStatusCache.set(sentrio.ip, {
                status: response.data.success ? 'online' : 'offline',
                lastUpdate: new Date()
            });
        } catch (error) {
            sentryStatusCache.set(sentrio.ip, {
                status: 'offline',
                lastUpdate: new Date(),
                error: error.message
            });
        }
    }
}

async function fetchcallStatus(req, res, _next) {
    try {
        const config = getConfig();
        const { username, password } = config.auth;
        const { ip } = req.query;
        
        if (!ip) {
            return res.status(400).json({ success: false, error: 'IP address required' });
        }
        
        const response = await makeDigestRequest(
            `https://${ip}/api/call/status`,
            'GET',
            null,
            username,
            password
        );
        
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

async function disconnectCall(req, res, _next) {
    try {
        const config = getConfig();
        const { username, password } = config.auth;
        const { ip, session } = req.body;
        
        if (!ip || !session) {
            return res.status(400).json({ success: false, error: 'IP address and session required' });
        }
        
        const response = await makeDigestRequest(
            `https://${ip}/api/call/hangup?session=${session}`,
            'POST',
            null,
            username,
            password
        );
        
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

async function sendMessage(req, res, _next) {
    try {
        const config = getConfig();
        const { username, password } = config.auth;
        const { ip, messageUid } = req.body;
        
        if (!ip || !messageUid) {
            return res.status(400).json({ success: false, error: 'IP address and message UID required' });
        }
        
        const message = config.messages.find(m => m.uid === messageUid);
        if (!message) {
            return res.status(404).json({ success: false, error: 'Message not found' });
        }
        
        const response = await makeDigestRequest(
            `https://${ip}/api/display/text`,
            'PUT',
            message,
            username,
            password,
            60000 // 60 second timeout for user response
        );
        
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

async function sendFreetextMessage(req, res, _next) {
    try {
        const config = getConfig();
        const { username, password } = config.auth;
        const { ip, freetext } = req.body;
        
        if (!ip || !freetext) {
            return res.status(400).json({ success: false, error: 'IP address and freetext message required' });
        }
        
        // Validate freetext format
        if (!freetext.uid || !freetext.text) {
            return res.status(400).json({ success: false, error: 'Freetext message must have uid and text' });
        }
        
        // Use the freetext format as specified
        const messagePayload = {
            uid: freetext.uid,
            text: freetext.text,
            response: freetext.response || false,
            timeout: freetext.timeout || 30,
            icon: freetext.icon || "technician"
        };
        
        const response = await makeDigestRequest(
            `https://${ip}/api/display/text`,
            'PUT',
            messagePayload,
            username,
            password,
            (freetext.timeout || 30) * 1000 // Convert to milliseconds
        );
        
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

async function fetchCamSnapshot(req, res, _next) {
    try {
        const config = getConfig();
        const { username, password } = config.auth;
        const { ip, width = 640, height = 480, source = 'external' } = req.query;
        
        if (!ip) {
            return res.status(400).json({ success: false, error: 'IP address required' });
        }
        
        const response = await makeDigestRequest(
            `https://${ip}/api/camera/snapshot?width=${width}&height=${height}&source=${source}`,
            'GET',
            null,
            username,
            password,
            10000, // 10 second timeout for images
            'arraybuffer' // Request binary data
        );
        
        res.set('Content-Type', response.headers['content-type']);
        res.send(Buffer.from(response.data));
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

function pollStatus(req, res) {
    const { ip, interval = 3000 } = req.query;
    
    if (!ip) {
        return res.status(400).json({ success: false, error: 'IP address required' });
    }
    
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    
    const config = getConfig();
    const { username, password } = config.auth;
    
    const pollInterval = setInterval(async () => {
        try {
            const response = await makeDigestRequest(
                `https://${ip}/api/call/status`,
                'GET',
                null,
                username,
                password
            );
            
            res.write(`data: ${JSON.stringify(response.data)}\n\n`);
        } catch (error) {
            res.write(`data: ${JSON.stringify({ success: false, error: error.message })}\n\n`);
        }
    }, parseInt(interval));
    
    req.on('close', () => {
        clearInterval(pollInterval);
    });
}

function createMessage(req, res, _next) {
    try {
        const config = getConfig();
        const { uid, message, response = false, timeout = 30, icon = 'operator' } = req.body;
        
        if (!uid || !message) {
            return res.status(400).json({ success: false, error: 'UID and message required' });
        }
        
        const existingIndex = config.messages.findIndex(m => m.uid === uid);
        const newMessage = { uid, message, response, timeout, icon };
        
        if (existingIndex >= 0) {
            config.messages[existingIndex] = newMessage;
        } else {
            config.messages.push(newMessage);
        }
        
        require('../config').saveConfig();
        res.json({ success: true, message: newMessage });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

function editMessage(req, res, _next) {
    try {
        const config = getConfig();
        const { id } = req.params;
        const { message, response, timeout, icon } = req.body;
        
        const messageIndex = config.messages.findIndex(m => m.uid === id);
        if (messageIndex === -1) {
            return res.status(404).json({ success: false, error: 'Message not found' });
        }
        
        if (message) config.messages[messageIndex].message = message;
        if (response !== undefined) config.messages[messageIndex].response = response;
        if (timeout !== undefined) config.messages[messageIndex].timeout = timeout;
        if (icon) config.messages[messageIndex].icon = icon;
        
        require('../config').saveConfig();
        res.json({ success: true, message: config.messages[messageIndex] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

function deleteMessage(req, res, _next) {
    try {
        const config = getConfig();
        const { id } = req.params;
        
        const messageIndex = config.messages.findIndex(m => m.uid === id);
        if (messageIndex === -1) {
            return res.status(404).json({ success: false, error: 'Message not found' });
        }
        
        const deletedMessage = config.messages.splice(messageIndex, 1)[0];
        require('../config').saveConfig();
        res.json({ success: true, deleted: deletedMessage });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// Chat history management
const fs = require('fs');
const path = require('path');

function getChatHistory(req, res) {
    try {
        const { ip } = req.params;
        const { newCall } = req.query; // Add parameter to check if this is for a new call
        const deviceDir = path.join(__dirname, '..', 'chat-history', ip.replace(/\./g, '_'));
        
        // If this is for a new call, return empty history
        if (newCall === 'true') {
            res.json({ success: true, history: [] });
            return;
        }
        
        // Get the latest session file for this device (for viewing history)
        if (fs.existsSync(deviceDir)) {
            const files = fs.readdirSync(deviceDir).filter(f => f.endsWith('.json'));
            if (files.length > 0) {
                // Sort by modification time, get newest
                const latestFile = files
                    .map(f => ({ name: f, path: path.join(deviceDir, f), stats: fs.statSync(path.join(deviceDir, f)) }))
                    .sort((a, b) => b.stats.mtime - a.stats.mtime)[0];
                
                const history = JSON.parse(fs.readFileSync(latestFile.path, 'utf8'));
                res.json({ success: true, history, sessionFile: latestFile.name });
            } else {
                res.json({ success: true, history: [] });
            }
        } else {
            res.json({ success: true, history: [] });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

function saveChatHistory(req, res) {
    try {
        const { ip } = req.params;
        const { history, sessionId } = req.body;
        
        const deviceDir = path.join(__dirname, '..', 'chat-history', ip.replace(/\./g, '_'));
        if (!fs.existsSync(deviceDir)) {
            fs.mkdirSync(deviceDir, { recursive: true });
        }
        
        // Use provided sessionId or create one based on timestamp
        const sessionName = sessionId || `session_${new Date().toISOString().replace(/[:.]/g, '-')}`;
        const historyFile = path.join(deviceDir, `${sessionName}.json`);
        
        const sessionData = {
            sessionId: sessionName,
            deviceIp: ip,
            startTime: history.length > 0 ? history[0].date : new Date().toISOString(),
            lastUpdate: new Date().toISOString(),
            history
        };
        
        fs.writeFileSync(historyFile, JSON.stringify(sessionData, null, 2));
        
        res.json({ success: true, sessionFile: `${sessionName}.json` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

function getChatSessions(req, res) {
    try {
        const { ip } = req.params;
        const deviceDir = path.join(__dirname, '..', 'chat-history', ip.replace(/\./g, '_'));
        
        if (fs.existsSync(deviceDir)) {
            const files = fs.readdirSync(deviceDir).filter(f => f.endsWith('.json'));
            const sessions = files
                .map(file => {
                    try {
                        const filePath = path.join(deviceDir, file);
                        const stats = fs.statSync(filePath);
                        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        return {
                            sessionId: data.sessionId || file.replace('.json', ''),
                            fileName: file,
                            startTime: data.startTime,
                            lastUpdate: data.lastUpdate || stats.mtime.toISOString(),
                            messageCount: data.history ? data.history.length : 0
                        };
                    } catch (e) {
                        return null;
                    }
                })
                .filter(session => session !== null)
                .sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate));
            
            res.json({ success: true, sessions });
        } else {
            res.json({ success: true, sessions: [] });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

function clearChatHistory(req, res) {
    try {
        const { ip } = req.params;
        const { sessionId } = req.query;
        const deviceDir = path.join(__dirname, '..', 'chat-history', ip.replace(/\./g, '_'));
        
        if (sessionId) {
            // Clear specific session
            const sessionFile = path.join(deviceDir, `${sessionId}.json`);
            if (fs.existsSync(sessionFile)) {
                fs.unlinkSync(sessionFile);
            }
        } else {
            // Clear all sessions for this device
            if (fs.existsSync(deviceDir)) {
                const files = fs.readdirSync(deviceDir);
                files.forEach(file => {
                    if (file.endsWith('.json')) {
                        fs.unlinkSync(path.join(deviceDir, file));
                    }
                });
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

var router = express.Router();


/* GET index page */
router.get('/', fetchSentrios, function(req, res, next) {
    res.locals.filter = null;
    res.render('index');
});

router.get('/sentrios', fetchSentrios)

router.get('/calls/status', fetchcallStatus)

router.post('/calls/disconnect', disconnectCall)

router.put('/message', sendMessage)

router.put('/message/freetext', sendFreetextMessage)

router.get('/snapshot', fetchCamSnapshot)

router.get('/events', pollStatus)

router.post('/message/add', createMessage)
router.put('/message/:id/edit', editMessage)
router.post('/message/:id/delete', deleteMessage)

// Chat history endpoints
router.get('/chat-history/:ip', getChatHistory)
router.get('/chat-history/:ip/sessions', getChatSessions)
router.post('/chat-history/:ip', saveChatHistory)
router.delete('/chat-history/:ip', clearChatHistory)
router.get('/chat-history/:ip/download/:fileName', function(req, res) {
    try {
        const { ip, fileName } = req.params;
        const deviceDir = path.join(__dirname, '..', 'chat-history', ip.replace(/\./g, '_'));
        const filePath = path.join(deviceDir, fileName);
        
        // Security check: ensure file is within device directory
        if (!filePath.startsWith(deviceDir) || !fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }
        
        res.download(filePath, fileName);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
})

// Additional endpoints for managing sentrios
router.post('/sentrios/add', function(req, res) {
    try {
        const { ip, name } = req.body;
        if (!ip || !name) {
            return res.status(400).json({ success: false, error: 'IP and name required' });
        }
        
        addSentrio(ip, name);
        res.json({ success: true, message: 'Sentrio added successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/sentrios/remove', function(req, res) {
    try {
        const { ip } = req.body;
        if (!ip) {
            return res.status(400).json({ success: false, error: 'IP required' });
        }
        
        removeSentrio(ip);
        res.json({ success: true, message: 'Sentrio removed successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get available messages
router.get('/messages', function(req, res) {
    try {
        const config = getConfig();
        res.json({ success: true, messages: config.messages });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get cached status for quick updates
router.get('/sentrios/status', function(req, res) {
    try {
        const config = getConfig();
        const results = [];
        
        for (const sentrio of config.sentrios) {
            const cached = sentryStatusCache.get(sentrio.ip);
            results.push({
                ip: sentrio.ip,
                name: sentrio.name,
                status: cached ? cached.status : 'unknown',
                lastUpdate: cached ? cached.lastUpdate : null,
                error: cached ? cached.error : null
            });
        }
        
        res.json({ success: true, sentrios: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;