# 🎯 Test Interpreter Queue System 

## Quick Test URLs

### Interpreter Window:
```
https://127.0.0.1:8080/?role=interpreter
```

### Client Window:
```
https://127.0.0.1:8080/?role=client
```

## Full End-to-End Test Flow:

### Step 1: Start Interpreter
1. Open interpreter window: `https://127.0.0.1:8080/?role=interpreter`
2. Toggle "Active" in Queue Status section ✅
3. Check browser console - should see connection logs

### Step 2: Request Interpreter (Client)
1. Open client window: `https://127.0.0.1:8080/?role=client`  
2. Click "🌐 Request Interpreter" button
3. Button should change to "⏳ Requesting..." then "🎉 Joining in 3s"

### Step 3: Auto-Join Meeting Room
**Client side:** 
- Automatic redirect after 3-second countdown
- Joins room: `interpreter-session-[timestamp]-[id]`

**Interpreter side:**
- Popup confirmation: "New client needs interpretation"
- Click "OK" to join same room

### Step 4: Meeting Session
- Both parties now in shared Jitsi meeting room
- Room URL includes `?interpreterSession=true` parameter
- Ready for video/audio interpretation session

## Expected Behavior:

✅ **Queue Management:** Real-time interpreter active/inactive status  
✅ **Smart Matching:** First available interpreter gets first request  
✅ **Auto Room Creation:** Unique room name per session  
✅ **Seamless Joining:** Automatic redirect with countdown  
✅ **Role Persistence:** Client/interpreter roles maintained in meeting  

## Queue Server Status:
- Health check: `http://localhost:3001/health`
- Console logs show real-time matching events
- WebSocket connections tracked per user role

## Advanced Testing:

### Multi-User Test:
1. Open multiple interpreter tabs with different names
2. Open multiple client tabs 
3. Test queue ordering (FIFO)
4. Test interpreter busy/available states

### Edge Cases:
- No interpreters available → client queued
- Interpreter goes inactive while assigned → handles gracefully  
- Multiple rapid requests → proper queue management

---
**Ready to test the complete interpreter-client matching workflow!** 🚀