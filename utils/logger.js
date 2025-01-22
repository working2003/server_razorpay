const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

const logFile = path.join(logsDir, 'server.log');

function formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] ${level}: ${message}`;
    if (data) {
        logMessage += `\n${JSON.stringify(data, null, 2)}`;
    }
    return logMessage + '\n';
}

const logger = {
    info: (message, data = null) => {
        const logMessage = formatMessage('INFO', message, data);
        fs.appendFileSync(logFile, logMessage);
        console.log(logMessage);
    },
    error: (message, data = null) => {
        const logMessage = formatMessage('ERROR', message, data);
        fs.appendFileSync(logFile, logMessage);
        console.error(logMessage);
    },
    debug: (message, data = null) => {
        const logMessage = formatMessage('DEBUG', message, data);
        fs.appendFileSync(logFile, logMessage);
        console.log(logMessage);
    }
};

module.exports = logger;
