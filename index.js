require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const bodyParser = require('body-parser');
const Bottleneck = require('bottleneck');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Load Telegram bot token
const token = process.env.TELEGRAM_BOT_TOKEN || "7346817601:AAH8boOYeT521yf4Ge3TXV_yuAwhWc3eVag";
if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set in .env file');
  process.exit(1);
}

// Initialize Telegram bot with webhook
const webhookUrl = process.env.WEBHOOK_URL || `https://telligram.vercel.app/bot${token}`;
const bot = new TelegramBot(token);
bot.setWebHook(webhookUrl)
  .then(() => console.log(`Webhook set to ${webhookUrl}`))
  .catch((error) => {
    console.error('Failed to set webhook:', error.message);
    process.exit(1);
  });

// Middleware
app.use(bodyParser.json());

// Pollinations API base URLs
const TEXT_API = 'https://text.pollinations.ai/';
const IMAGE_API = 'https://image.pollinations.ai/prompt/';

// Request limiter to prevent API overload
const limiter = new Bottleneck({
  minTime: 1000, // 1 request per second
  maxConcurrent: 1 // Only one request at a time
});

// Store latest API response time and status
let latestApiResponse = {
  responseTime: null,
  status: 'unknown',
  lastChecked: null,
  error: null,
  attemptCount: 0
};

// Retry function for API calls
const axiosWithRetry = async (config, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const start = Date.now();
      const response = await limiter.schedule(() => axios(config));
      const responseTime = Date.now() - start;
      latestApiResponse = {
        responseTime: responseTime,
        status: 'success',
        lastChecked: new Date().toISOString(),
        error: null,
        attemptCount: i + 1
      };
      console.log(`API call to ${config.url} succeeded in ${responseTime}ms after ${i + 1} attempt(s)`);
      return response;
    } catch (error) {
      latestApiResponse = {
        responseTime: null,
        status: 'failed',
        lastChecked: new Date().toISOString(),
        error: error.message,
        attemptCount: i + 1
      };
      if (i === retries - 1) throw error;
      console.warn(`Retry ${i + 1}/${retries} for ${config.url}: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i))); // Exponential backoff
    }
  }
};

// Test Pollinations API on startup
const testPollinationsApi = async () => {
  console.log('Testing Pollinations API on startup...');
  try {
    await axiosWithRetry({
      method: 'post',
      url: TEXT_API,
      data: {
        model: 'openai',
        messages: [
          { role: 'system', content: 'You are a test system.' },
          { role: 'user', content: 'Test API' }
        ],
        max_tokens: 10
      },
      timeout: 10000
    });
    console.log('Pollinations API test successful');
  } catch (error) {
    console.error('Pollinations API test failed:', error.message);
  }
};

// Run API test on startup
testPollinationsApi();

// Health check route
app.get('/health', async (req, res) => {
  console.log('Health endpoint accessed');
  try {
    const botInfo = await bot.getMe();
    res.status(200).json({
      status: 'healthy',
      bot: `@${botInfo.username}`,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      pollinationsApi: {
        responseTime: latestApiResponse.responseTime !== null ? `${latestApiResponse.responseTime}ms` : 'Failed or no successful calls',
        status: latestApiResponse.status,
        lastChecked: latestApiResponse.lastChecked || 'Never',
        error: latestApiResponse.error || null,
        attemptCount: latestApiResponse.attemptCount || 0
      }
    });
  } catch (error) {
    console.error('Health endpoint error:', error.message);
    res.status(500).json({
      status: 'unhealthy',
      bot: 'unknown',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      error: error.message,
      pollinationsApi: {
        responseTime: latestApiResponse.responseTime !== null ? `${latestApiResponse.responseTime}ms` : 'Failed or no successful calls',
        status: latestApiResponse.status,
        lastChecked: latestApiResponse.lastChecked || 'Never',
        error: latestApiResponse.error || null,
        attemptCount: latestApiResponse.attemptCount || 0
      }
    });
  }
});

// Webhook route for Telegram
app.post(`/bot${token}`, (req, res) => {
  console.log('Webhook received update');
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Test bot connection on startup
bot.getMe()
  .then((botInfo) => {
    console.log(`Bot connected successfully: @${botInfo.username}`);
  })
  .catch((error) => {
    console.error('Failed to connect to Telegram API:', error.message);
    process.exit(1);
  });

// /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await bot.sendMessage(chatId, `Greetings, ${msg.from.first_name}! I am BAI, an AI-powered assistant trained by Bhumit Panchani. You may:\n\n` +
      `- Submit a question or statement (e.g., "What is AI?" or "Provide a summary of space") for text responses.\n` +
      `- Request an image with phrases such as "create an image," "draw," or "paint" (e.g., "Draw a cat" or "Create an image of a sunset").\n` +
      `- Send an image with a caption (e.g., "Describe this") for image analysis.\n\n` +
      `Type /help for additional guidance.`);
  } catch (error) {
    console.error(`Error sending /start response to chat ${chatId}: ${error.message}`);
  }
});

// /help command
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await bot.sendMessage(chatId, `Instructions for Using @ChatGlowBot:\n\n` +
      `- **Text Generation**: Submit a question or statement (e.g., "What is the capital of France?" or "Compose a poem").\n` +
      `- **Image Generation**: Request an image using phrases like "create an image," "draw," "paint," "sketch," "make a picture," etc. (e.g., "Draw a forest" or "Paint a landscape").\n` +
      `- **Image Analysis**: Send an image with a caption (e.g., send an image with caption "What is in this picture?").\n\n` +
      `BAI will process your input accordingly. Please feel free to explore its capabilities.`);
  } catch (error) {
    console.error(`Error sending /help response to chat ${chatId}: ${error.message}`);
  }
});

// Track processing messages and prevent duplicates
const processingStates = new Map();

// Handle all messages
bot.on('message', async (msg) => {
  // Skip if message is a command
  if (msg.text && msg.text.startsWith('/')) return;
  
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const text = msg.text ? msg.text.trim().toLowerCase() : '';
  
  // Create unique key for this message
  const messageKey = `${chatId}_${messageId}`;
  
  // Skip if already processing this message
  if (processingStates.has(messageKey)) {
    console.log(`Already processing message ${messageKey}, skipping...`);
    return;
  }

  // Handle text input (text generation or image generation)
  if (text && !msg.photo) {
    // Mark as processing
    processingStates.set(messageKey, { type: 'text', timestamp: Date.now() });
    
    if (text.includes('create an image') || text.includes('generate a picture') || 
        text.includes('draw') || text.includes('paint') || text.includes('sketch') ||
        text.includes('make an image') || text.includes('make a picture') || 
        text.includes('produce an image') || text.includes('illustrate') ||
        text.includes('design a picture') || text.includes('render an image') ||
        text.includes('create image') || text.includes('generate image') ||
        text.includes('create picture') || text.includes('generate picture')) {
      
      let processingMessage = null;
      
      try {
        // Send processing message
        processingMessage = await bot.sendMessage(chatId, 'Generating your image...');
        console.log(`Sent processing message for image generation: ${messageKey}`);
        
        // Generate image
        const userPrompt = text.replace(/(create an image|generate a picture|draw|paint|sketch|make an image|make a picture|produce an image|illustrate|design a picture|render an image|create image|generate image|create picture|generate picture)/gi, '').trim();
        const prompt = encodeURIComponent(userPrompt);
        const url = `${IMAGE_API}${prompt}?width=512&height=512&model=flux&nologo=true`;
        
        console.log(`Generating image with URL: ${url}`);
        
        // Delete processing message
        if (processingMessage) {
          await bot.deleteMessage(chatId, processingMessage.message_id);
        }
        
        // Send image
        await bot.sendPhoto(chatId, url, { caption: `Image generated by BAI, for: ${msg.text}` });
        console.log(`Successfully sent image for message: ${messageKey}`);
        
      } catch (error) {
        console.error(`Image generation failed for ${messageKey}: ${error.message}`);
        
        // Delete processing message if it exists
        if (processingMessage) {
          try {
            await bot.deleteMessage(chatId, processingMessage.message_id);
          } catch (deleteError) {
            console.error(`Failed to delete processing message: ${deleteError.message}`);
          }
        }
      } finally {
        // Clean up processing state
        processingStates.delete(messageKey);
      }
      
    } else {
      // Text generation
      let processingMessage = null;
      
      try {
        // Send processing message
        processingMessage = await bot.sendMessage(chatId, 'Processing your request...');
        console.log(`Sent processing message for text generation: ${messageKey}`);
        
        // Make API call
        console.log(`Making text API call for: "${msg.text}"`);
        const response = await axiosWithRetry({
          method: 'post',
          url: TEXT_API,
          data: {
            model: 'openai',
            messages: [
              { role: 'system', content: 'You are BAI, an AI assistant trained by Bhumit Panchani. Respond professionally and avoid identifying as any other entity.' },
              { role: 'user', content: msg.text }
            ],
            max_tokens: 300
          },
          timeout: 30000
        });
        
        console.log(`Received API response for ${messageKey}:`, response.data);
        
        // Delete processing message
        if (processingMessage) {
          await bot.deleteMessage(chatId, processingMessage.message_id);
        }
        
        // Send response
        const textResponse = response.data || 'No response received from API.';
        await bot.sendMessage(chatId, textResponse);
        console.log(`Successfully sent text response for message: ${messageKey}`);
        
      } catch (error) {
        console.error(`Text generation failed for ${messageKey}: ${error.message}`);
        
        // Delete processing message if it exists
        if (processingMessage) {
          try {
            await bot.deleteMessage(chatId, processingMessage.message_id);
          } catch (deleteError) {
            console.error(`Failed to delete processing message: ${deleteError.message}`);
          }
        }
      } finally {
        // Clean up processing state
        processingStates.delete(messageKey);
      }
    }
  }

  // Handle image input (analysis)
  if (msg.photo) {
    // Mark as processing
    processingStates.set(messageKey, { type: 'image', timestamp: Date.now() });
    
    const photo = msg.photo[msg.photo.length - 1]; // Get highest resolution
    const caption = msg.caption ? msg.caption.trim() : 'Describe this image';
    let processingMessage = null;

    try {
      // Send processing message
      processingMessage = await bot.sendMessage(chatId, 'Analyzing your image...');
      console.log(`Sent processing message for image analysis: ${messageKey}`);
      
      // Get image file
      const file = await bot.getFile(photo.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

      console.log(`Making image analysis API call for: "${caption}"`);
      const response = await axiosWithRetry({
        method: 'post',
        url: TEXT_API,
        data: {
          model: 'openai',
          messages: [
            { role: 'system', content: 'You are BAI, an AI assistant trained by Bhumit Panchani. Respond professionally and avoid identifying as any other entity.' },
            {
              role: 'user',
              content: [
                { type: 'text', text: caption },
                { type: 'image_url', image_url: { url: fileUrl } }
              ]
            }
          ],
          max_tokens: 300
        },
        timeout: 30000
      });
      
      console.log(`Received image analysis response for ${messageKey}:`, response.data);
      
      // Delete processing message
      if (processingMessage) {
        await bot.deleteMessage(chatId, processingMessage.message_id);
      }
      
      // Send response
      const analysisText = response.data || 'No analysis received from API.';
      await bot.sendMessage(chatId, analysisText);
      console.log(`Successfully sent image analysis response for message: ${messageKey}`);
      
    } catch (error) {
      console.error(`Image analysis failed for ${messageKey}: ${error.message}`);
      
      // Delete processing message if it exists
      if (processingMessage) {
        try {
          await bot.deleteMessage(chatId, processingMessage.message_id);
        } catch (deleteError) {
          console.error(`Failed to delete processing message: ${deleteError.message}`);
        }
      }
    } finally {
      // Clean up processing state
      processingStates.delete(messageKey);
    }
  }
});

// Clean up old processing states every 5 minutes
setInterval(() => {
  const now = Date.now();
  const fiveMinutesAgo = now - (5 * 60 * 1000);
  
  for (const [key, state] of processingStates.entries()) {
    if (state.timestamp < fiveMinutesAgo) {
      console.log(`Cleaning up old processing state: ${key}`);
      processingStates.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Start Express server
app.listen(port, () => {
  console.log(`Express server running on port ${port}`);
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
});

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
