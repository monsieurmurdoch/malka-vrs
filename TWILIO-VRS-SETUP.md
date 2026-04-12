# 🎯 Twilio VRS Setup Guide

Complete setup guide for Video Relay Service (VRS) phone calling in Malka Meet.

## 📋 Overview

The VRS system allows interpreters to make outbound phone calls from within the meeting room using Twilio Voice API. This enables seamless Video Relay Service where deaf/hard-of-hearing clients can communicate via video with interpreters who relay the conversation to hearing parties over the phone.

## 🏗️ Architecture

```
[Client Video] ↔ [Interpreter Video + Numpad] ↔ [Phone Call via Twilio]
```

**Components:**
- **Frontend**: Collapsible phone numpad in meeting room (interpreters only)
- **Backend**: Node.js server handling Twilio Voice API calls
- **Twilio**: Cloud voice service for phone connectivity

## 🚀 Quick Setup

### 1. Install Dependencies
```bash
# Run the setup script
./setup-twilio-server.sh

# OR manually:
mkdir twilio-voice-server
cd twilio-voice-server
npm install express cors body-parser twilio nodemon
```

### 2. Get Twilio Credentials

1. Sign up at [Twilio Console](https://console.twilio.com/)
2. Get your **Account SID** and **Auth Token** from the dashboard
3. Purchase a **Twilio Phone Number** for outbound calls
4. Set up your **webhook URL** (see webhook section below)

### 3. Configure Environment Variables
```bash
export TWILIO_ACCOUNT_SID='AC1234567890abcdef1234567890abcdef'
export TWILIO_AUTH_TOKEN='your_auth_token_here'
export TWILIO_PHONE_NUMBER='+15551234567'
export WEBHOOK_BASE_URL='https://your-domain.com'
```

### 4. Start the Server
```bash
cd twilio-voice-server
npm start
```

Server runs on: `http://localhost:3002`

## 🔗 Webhook Configuration

### What You Need
The Twilio server needs a **public webhook URL** to receive call status updates. You have options:

**Option A: Production Webhook (Recommended)**
```bash
export WEBHOOK_BASE_URL='https://your-production-domain.com'
```

**Option B: Development with ngrok**
```bash
# Install ngrok: https://ngrok.com/
ngrok http 3002

# Use the provided URL:
export WEBHOOK_BASE_URL='https://abc123.ngrok.io'
```

**Option C: No Webhooks (Limited functionality)**
```bash
export WEBHOOK_BASE_URL='http://localhost:3002'
# Note: Status updates will be limited
```

### Webhook Endpoint
Your webhook URL should point to: `{WEBHOOK_BASE_URL}/api/voice/webhook`

Example: `https://your-domain.com/api/voice/webhook`

## 🎮 How Interpreters Use VRS

### In the Meeting Room:
1. **Numpad Access**: Phone icon (📞) appears in bottom-right corner (interpreters only)
2. **Expand Interface**: Click phone icon to open translucent numpad
3. **Enter Number**: Use on-screen keypad or type phone number
4. **Initiate Call**: Click "Call" button to start VRS call
5. **Manage Call**: Real-time status, duration timer, "End" button

### Call Flow:
1. **Dialing**: Twilio initiates outbound call
2. **Ringing**: Phone rings at destination number
3. **Connected**: Three-way conversation (Client ↔ Interpreter ↔ Phone)
4. **Translation**: Interpreter facilitates communication between parties
5. **End Call**: Either party can hang up

## 🔧 API Endpoints

The backend server provides these endpoints:

### Core Endpoints:
- `POST /api/voice/call` - Initiate outbound call
- `POST /api/voice/hangup` - End active call  
- `GET /api/voice/status/:callSid` - Get call status
- `POST /api/voice/webhook/:sessionId` - Handle Twilio webhooks

### Management:
- `GET /health` - Server health check
- `GET /api/readiness` - Readiness and configuration blockers
- `GET /api/voice/calls` - List active calls (debugging)

## 📊 Monitoring & Debugging

### Health Check
```bash
curl http://localhost:3002/health
curl http://localhost:3002/api/readiness
```

Expected response:
```json
{
  "status": "ok",
  "service": "twilio-voice-server", 
  "activeCalls": 0,
  "uptime": 123.45,
  "twilioConfigured": true
}
```

### Active Calls
```bash
curl http://localhost:3002/api/voice/calls
```

### Logs
Server logs all call activity:
```
[2025-01-15T10:30:00.000Z] Initiating call from interpreter-123 to +15551234567
[2025-01-15T10:30:05.000Z] Call initiated: CA1234567890 (interpreter-123 -> +15551234567)
[2025-01-15T10:30:10.000Z] Webhook received: CA1234567890 -> ringing
[2025-01-15T10:30:15.000Z] Webhook received: CA1234567890 -> answered
```

## 🔒 Security Considerations

### Environment Variables
- **Never commit** credentials to version control
- Use `.env` files or environment management tools
- Rotate tokens regularly

### Webhook Security
- Validate Twilio webhook signatures (implemented in the voice server)
- Use HTTPS for all webhook URLs
- Implement rate limiting for production

### Network Security
- Run backend server behind firewall
- Use CORS configuration for frontend access only
- Monitor for unusual calling patterns

## 🧪 Testing

### Frontend Testing
1. Open interpreter meeting room: `https://127.0.0.1:8080/?role=interpreter`
2. Look for phone numpad icon (bottom-right)
3. Expand and test interface (without making actual calls)

### Backend Testing
```bash
# Test call initiation (mock)
curl -X POST http://localhost:3002/api/voice/call \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+15551234567","interpreterId":"test-123","sessionId":"session-456"}'
```

### End-to-End Testing
1. Configure valid Twilio credentials
2. Use your own phone number for testing
3. Start interpreter session and make test call
4. Verify call quality and status updates

## 🐛 Troubleshooting

### Common Issues:

**"Twilio not configured" Error**
- Check environment variables are set correctly
- Verify Account SID and Auth Token are valid
- Ensure Twilio phone number is purchased and active

**Webhook Not Receiving Updates**
- Verify webhook URL is publicly accessible
- Check firewall/routing configuration
- Test webhook URL manually: `curl https://your-domain.com/api/voice/webhook`

**Calls Fail to Connect**
- Verify phone number format (+1XXXXXXXXXX for US)
- Check Twilio account balance
- Review Twilio console logs for detailed error messages

**Frontend Numpad Not Appearing**
- Ensure user is detected as interpreter (check role detection)
- Verify user is in meeting room (not prejoin/lobby)
- Check browser console for JavaScript errors

### Debug Commands:
```bash
# Check if server is running
curl http://localhost:3002/health

# View active calls
curl http://localhost:3002/api/voice/calls

# Test with verbose logging
DEBUG=* npm start
```

## 📈 Production Deployment

### Server Deployment:
1. Deploy to cloud provider (AWS, Google Cloud, etc.)
2. Set up proper domain with SSL certificate
3. Configure environment variables securely
4. Set up monitoring and alerts
5. Implement proper logging and error tracking

### Scaling Considerations:
- Use Redis for call state storage (instead of in-memory)
- Implement connection pooling for database
- Add load balancing for multiple server instances
- Monitor Twilio usage and costs

## 🎉 Ready!

Once configured, interpreters will see the VRS phone numpad in their meeting room and can make outbound calls seamlessly. The system handles all the complexity of Twilio integration behind the scenes.

**Need your webhook URL to complete the setup!** 

What's your webhook endpoint where you want to receive call status updates?