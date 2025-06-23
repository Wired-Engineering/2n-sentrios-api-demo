# 2N Sentrio API Test Application

**Project number 25-0129**  
**Elevator Modernization Project**

A Node.js Express application for testing and managing 2N Sentrio API functionality. This application provides a web interface and REST API endpoints for managing Sentrio devices, calls, messaging, and camera operations.

## Prerequisites

- Node.js (v14 or higher)
- npm
- 2N Sentrio devices with API access enabled

## Installation

1. Clone or download the project
2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your devices in `config.yaml` (see Configuration section)

4. Start the application:
   ```bash
   # Production
   npm start
   
   # Development (with auto-restart)
   npm run dev
   ```

5. Access the web interface at `http://localhost:3000`

## Configuration

On first start, the application will create a `config.yaml` in the project root:

```yaml
auth:
  username: admin
  password: your_device_password

sentrios: []

polling:
  health_check_interval: 5000  # Health check interval in ms
  call_status_interval: 3000   # Call status polling in ms

messages: []
```

## API Endpoints

### Device Management
- `GET /sentrios` - Get all devices with health status
- `POST /sentrios/add` - Add new device (requires `ip`, `name`)
- `POST /sentrios/remove` - Remove device (requires `ip`)

### Call Management
- `GET /calls/status?ip=<device_ip>` - Get call status for device
- `POST /calls/disconnect` - Disconnect active call (requires `ip`, `session`)
- `GET /events?ip=<device_ip>&interval=3000` - Server-sent events for call polling

### Messaging
- `PUT /message` - Send message to device (requires `ip`, `messageUid`)
- `GET /messages` - Get available message templates
- `POST /message/add` - Create new message template
- `PUT /message/:id/edit` - Edit message template
- `POST /message/:id/delete` - Delete message template

### Camera
- `GET /snapshot?ip=<device_ip>&width=640&height=480&source=external` - Get camera snapshot

### Chat Management
- `GET /chat-history/:ip` - Get chat history for device
- `POST /chat-history/:ip` - Save chat history
- `DELETE /chat-history/:ip` - Clear chat history
- `GET /chat-history/:ip/sessions` - Get all chat sessions


## Architecture

### Project Structure
```
├── app.js                 # Express application setup
├── bin/www               # HTTP server configuration
├── config.yaml           # Device and message configuration
├── package.json          # Dependencies and scripts
├── src/
│   ├── routes/index.js   # API routes and handlers
│   ├── views/
│   │   ├── index.ejs     # Main web interface
│   │   └── error.ejs     # Error page template
│   └── chat-history/     # Chat session storage
│       └── [device_ip]/  # Device-specific chat files
└── README.md
```