const axios = require('axios');

// Replace with your actual values
const BOT_TOKEN = '7346817601:AAH8boOYeT521yf4Ge3TXV_yuAwhWc3eVag';
const WEBHOOK_URL = 'https://telligram-5u19.vercel.app/api/webhook'; // e.g., 'https://your-app.vercel.app/api/webhook'

async function setWebhook() {
  try {
    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      url: WEBHOOK_URL,
      allowed_updates: ['message']
    });
    
    console.log('Webhook set successfully:', response.data);
  } catch (error) {
    console.error('Error setting webhook:', error.response?.data || error.message);
  }
}

async function getWebhookInfo() {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    console.log('Current webhook info:', response.data);
  } catch (error) {
    console.error('Error getting webhook info:', error.response?.data || error.message);
  }
}

// Run the setup
console.log('Setting up webhook...');
setWebhook().then(() => {
  console.log('Getting webhook info...');
  return getWebhookInfo();
});
