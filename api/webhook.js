const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Pollinations API base URLs
const TEXT_API = 'https://text.pollinations.ai/';
const IMAGE_API = 'https://image.pollinations.ai/prompt/';

// Helper function to handle text generation
async function handleTextGeneration(bot, chatId, text) {
  try {
    const prompt = encodeURIComponent(text);
    const response = await axios.post(TEXT_API, {
      model: 'openai',
      messages: [
        { role: 'system', content: 'You are BAI, an AI assistant trained by Bhumit Panchani. Respond professionally and avoid identifying as any other entity.' },
        { role: 'user', content: text }
      ],
      max_tokens: 300
    }, { timeout: 10000 });
    
    const textResponse = response.data || 'Sorry, I could not generate a response.';
    await bot.sendMessage(chatId, textResponse);
  } catch (error) {
    console.error('Text generation error:', error);
    await bot.sendMessage(chatId, `Error: Failed to generate text. Please try again or rephrase your request.`);
  }
}

// Helper function to handle image generation
async function handleImageGeneration(bot, chatId, text) {
  try {
    const userPrompt = text.replace(/(create an image|generate a picture|draw|paint|sketch|make an image|make a picture|produce an image|illustrate|design a picture|render an image|create image|generate image|create picture|generate picture)/gi, '').trim();
    const prompt = encodeURIComponent(userPrompt);
    const url = `${IMAGE_API}${prompt}?width=512&height=512&model=flux&nologo=true`;
    await bot.sendPhoto(chatId, url, { caption: text });
  } catch (error) {
    console.error('Image generation error:', error);
    await bot.sendMessage(chatId, `Error: Failed to generate image. Please try again or simplify your description.`);
  }
}

// Helper function to handle image analysis
async function handleImageAnalysis(bot, token, chatId, photo, caption) {
  try {
    const file = await bot.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    const response = await axios.post('https://text.pollinations.ai/', {
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
    }, { timeout: 15000 });
    
    const text = response.data || 'Sorry, I could not analyze the image.';
    await bot.sendMessage(chatId, text);
  } catch (error) {
    console.error('Image analysis error:', error);
    await bot.sendMessage(chatId, `Error: Failed to analyze the image. Please try again.`);
  }
}

// Main webhook handler
export default async function handler(req, res) {
  // Get bot token from environment variables
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('Error: TELEGRAM_BOT_TOKEN is not set in environment variables');
    return res.status(500).json({ error: 'Bot token not configured' });
  }

  // Initialize bot without polling (webhook mode)
  const bot = new TelegramBot(token);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const update = req.body;
    
    if (!update.message) {
      return res.status(200).json({ ok: true });
    }

    const msg = update.message;
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim().toLowerCase() : '';

    // Handle /start command
    if (text === '/start') {
      await bot.sendMessage(chatId, `Greetings, ${msg.from.first_name}! I am BAI, an AI-powered assistant trained by Bhumit Panchani. You may:\n\n` +
        `- Submit a question or statement (e.g., "What is AI?" or "Provide a summary of space") for text responses.\n` +
        `- Request an image with phrases such as "create an image," "draw," or "paint" (e.g., "Draw a cat" or "Create an image of a sunset").\n` +
        `- Send an image with a caption (e.g., "Describe this") for image analysis.\n\n` +
        `Type /help for additional guidance.`);
      return res.status(200).json({ ok: true });
    }

    // Handle /help command
    if (text === '/help') {
      await bot.sendMessage(chatId, `Instructions for Using @ChatGlowBot:\n\n` +
        `- **Text Generation**: Submit a question or statement (e.g., "What is the capital of France?" or "Compose a poem").\n` +
        `- **Image Generation**: Request an image using phrases like "create an image," "draw," "paint," "sketch," "make a picture," etc. (e.g., "Draw a forest" or "Paint a landscape").\n` +
        `- **Image Analysis**: Send an image with a caption (e.g., send an image with caption "What is in this picture?").\n\n` +
        `BAI will process your input accordingly. Please feel free to explore its capabilities.`);
      return res.status(200).json({ ok: true });
    }

    // Handle text messages
    if (text && !msg.photo) {
      // Check if it's an image generation request
      if (text.includes('create an image') || text.includes('generate a picture') || 
          text.includes('draw') || text.includes('paint') || text.includes('sketch') ||
          text.includes('make an image') || text.includes('make a picture') || 
          text.includes('produce an image') || text.includes('illustrate') ||
          text.includes('design a picture') || text.includes('render an image') ||
          text.includes('create image') || text.includes('generate image') ||
          text.includes('create picture') || text.includes('generate picture')) {
        
        await bot.sendMessage(chatId, 'Generating your image...');
        await handleImageGeneration(bot, chatId, text);
      } else {
        // Text generation request
        await bot.sendMessage(chatId, 'Processing your request...');
        await handleTextGeneration(bot, chatId, text);
      }
    }

    // Handle image messages
    if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1]; // Get highest resolution
      const caption = msg.caption ? msg.caption.trim() : 'Describe this image';
      
      await bot.sendMessage(chatId, 'Analyzing your image...');
      await handleImageAnalysis(bot, token, chatId, photo, caption);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
