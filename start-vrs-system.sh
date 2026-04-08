#!/bin/bash

echo "🎯 Starting Malka Meet VRS System..."

# Set your Twilio credentials
export TWILIO_ACCOUNT_SID='AC965dc265b0e379188da2094b347533a9'
export TWILIO_AUTH_TOKEN='0c5a90533369b92d7edb088c81609e1c'
export TWILIO_PHONE_NUMBER='(855) 652-0499'

# Clean up the phone number format for Twilio
export TWILIO_PHONE_NUMBER='+18556520499'

echo "📱 Using Twilio number: $TWILIO_PHONE_NUMBER"

# Start ngrok in background to create public webhook URL
echo "🌐 Starting ngrok tunnel for webhook..."
ngrok http 3002 --log=stdout > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!

# Wait for ngrok to start and get the URL
sleep 3
WEBHOOK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*\.ngrok\.io')

if [ -z "$WEBHOOK_URL" ]; then
    echo "⚠️  Could not get ngrok URL. Trying alternative method..."
    WEBHOOK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | python3 -c "import sys, json; print(json.load(sys.stdin)['tunnels'][0]['public_url'])" 2>/dev/null || echo "")
fi

if [ -z "$WEBHOOK_URL" ]; then
    echo "⚠️  Using localhost webhook (limited functionality)"
    WEBHOOK_URL="http://localhost:3002"
else
    echo "🔗 Webhook URL: $WEBHOOK_URL"
fi

export WEBHOOK_BASE_URL="$WEBHOOK_URL"

# Start the Twilio Voice Server
echo "🚀 Starting Twilio Voice Server..."
cd twilio-voice-server
node server.js &
SERVER_PID=$!

echo ""
echo "✅ VRS System Started!"
echo "📞 Twilio Server: http://localhost:3002"
echo "🔗 Webhook URL: $WEBHOOK_BASE_URL/api/voice/webhook"
echo "🏥 Health Check: http://localhost:3002/health"
echo ""
echo "🎮 Test the numpad in your meeting room at:"
echo "   https://127.0.0.1:8080/?role=interpreter"
echo ""
echo "Press Ctrl+C to stop all services..."

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping VRS services..."
    kill $SERVER_PID 2>/dev/null
    kill $NGROK_PID 2>/dev/null
    echo "✅ All services stopped"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup INT TERM

# Wait for user to stop
wait $SERVER_PID