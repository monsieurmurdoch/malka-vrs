#!/bin/bash

# Setup script for Twilio Voice Server
echo "🎯 Setting up Twilio Voice Server for VRS calls..."

# Create a directory for the server
mkdir -p twilio-voice-server
cd twilio-voice-server

# Copy the server files
cp ../twilio-voice-server.js server.js
cp ../twilio-server-package.json package.json

# Install dependencies
echo "📦 Installing Node.js dependencies..."
npm install

echo ""
echo "✅ Twilio Voice Server setup complete!"
echo ""
echo "🔧 CONFIGURATION REQUIRED:"
echo "   You need to set these environment variables:"
echo ""
echo "   export TWILIO_ACCOUNT_SID='your_account_sid_here'"
echo "   export TWILIO_AUTH_TOKEN='your_auth_token_here'"
echo "   export TWILIO_PHONE_NUMBER='+1234567890'"
echo "   export WEBHOOK_BASE_URL='https://your-domain.com'"
echo ""
echo "📱 Get your Twilio credentials from: https://console.twilio.com/"
echo ""
echo "🚀 To start the server:"
echo "   cd twilio-voice-server"
echo "   npm start"
echo ""
echo "🔍 Health check: http://localhost:3002/health"
echo ""