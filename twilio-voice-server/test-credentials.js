#!/usr/bin/env node

// Quick test to verify Twilio credentials
const TWILIO_ACCOUNT_SID = 'AC965dc265b0e379188da2094b347533a9';
const TWILIO_AUTH_TOKEN = '0c5a90533369b92d7edb088c81609e1c';
const TWILIO_PHONE_NUMBER = '+18556520499';

console.log('🔍 Testing Twilio Credentials...');
console.log(`Account SID: ${TWILIO_ACCOUNT_SID}`);
console.log(`Phone Number: ${TWILIO_PHONE_NUMBER}`);

try {
    const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    
    // Test by fetching account info
    twilio.api.accounts(TWILIO_ACCOUNT_SID).fetch()
        .then(account => {
            console.log('✅ Twilio credentials valid!');
            console.log(`Account Name: ${account.friendlyName}`);
            console.log(`Account Status: ${account.status}`);
            console.log('🎉 Ready for VRS calls!');
        })
        .catch(error => {
            console.log('❌ Twilio credential error:');
            console.log(`Error: ${error.message}`);
            console.log(`Code: ${error.code}`);
            
            if (error.code === 20003) {
                console.log('💡 This means your Account SID or Auth Token is incorrect');
            }
        });
        
} catch (error) {
    console.log('❌ Twilio library error:');
    console.log(`Error: ${error.message}`);
    
    if (error.code === 'MODULE_NOT_FOUND') {
        console.log('💡 Twilio library not installed. Run: npm install twilio');
    }
}