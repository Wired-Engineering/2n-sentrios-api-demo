const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

let config = null;

function createDefaultConfig() {
    return {
        auth: {
            username: "admin",
            password: "admin",
        },
        sentrios: [],
        polling: {
            health_check: 30000,
            call_status: 3000
        },
        messages: []
    };
}

function loadConfig() {
    if (config) {
        return config;
    }
    
    const configPath = path.join(__dirname, '../config.yaml');
    
    try {
        const fileContents = fs.readFileSync(configPath, 'utf8');
        config = yaml.load(fileContents);
        return config;
    } catch (error) {
        if (error.code === 'ENOENT') {
            // Config file doesn't exist, create default
            config = createDefaultConfig();
            const yamlStr = yaml.dump(config);
            fs.writeFileSync(configPath, yamlStr, 'utf8');
            console.log('Created default config.yaml file');
            return config;
        } else {
            console.error('Error loading config:', error);
            throw error;
        }
    }
}

function getConfig() {
    return loadConfig();
}

function addSentrio(ip, name) {
    const config = getConfig();
    if (!config.sentrios) {
        config.sentrios = [];
    }
    
    const existingIndex = config.sentrios.findIndex(s => s.ip === ip);
    if (existingIndex >= 0) {
        config.sentrios[existingIndex].name = name;
    } else {
        config.sentrios.push({ ip, name });
    }
    
    saveConfig();
}

function removeSentrio(ip) {
    const config = getConfig();
    if (config.sentrios) {
        config.sentrios = config.sentrios.filter(s => s.ip !== ip);
        saveConfig();
    }
}

function saveConfig() {
    try {
        const configPath = path.join(__dirname, '../config.yaml');
        const yamlStr = yaml.dump(config);
        fs.writeFileSync(configPath, yamlStr, 'utf8');
    } catch (error) {
        console.error('Error saving config:', error);
        throw error;
    }
}

module.exports = {
    getConfig,
    addSentrio,
    removeSentrio,
    saveConfig
};