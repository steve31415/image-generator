/**
 * API Function: Generate Image Batch
 * POST /api/generate
 *
 * Supports two providers:
 * - "gemini" (default): Uses Google Gemini, returns 1 image per call
 * - "midjourney": Uses APIFRAME/Midjourney, returns 4 images per call
 */

// Retry configuration for 429 and 5xx errors
const RETRY_DELAYS = [2000, 10000, 60000]; // 2s, 10s, 60s
const MAX_RETRIES = 3;

/**
 * Fetch with retry logic for 429 (rate limit) and 5xx (server error) responses
 * Retries up to 3 times with delays of 2, 10, and 60 seconds
 */
async function fetchWithRetry(url, options, context = 'API') {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);

      // Check if we should retry (429 or 5xx)
      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt];
          console.log(`[${context}] Got ${response.status}, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        // Max retries exceeded, return the error response
        console.error(`[${context}] Max retries (${MAX_RETRIES}) exceeded for status ${response.status}`);
      }

      return response;
    } catch (error) {
      // Network errors - also retry these
      lastError = error;
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt];
        console.log(`[${context}] Network error: ${error.message}, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      console.error(`[${context}] Max retries (${MAX_RETRIES}) exceeded for network error: ${error.message}`);
      throw error;
    }
  }

  throw lastError;
}

// Style description to append to prompts (text only, no Midjourney flags)
const STYLE_DESCRIPTION = "In the style of a vintage 1920 Art Deco travel poster. Bold geometric shapes, limited color palette, strong lines, sophisticated retro futurist style.";

// Moodboard + profile tags for personalization
const MOODBOARD_PROFILE = "--p a35c6a69-3196-4374-b049-bcd5b278375b m7318439057938186264";

// Style + variety tags (--c is the flag for variety/chaos, values 0-100)
const STYLE_TAGS = "--style raw --v 6.1 --ar 4:3 --stylize 350 --c 30";

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { id, baseSequence, prompt, provider = 'gemini', promptTemplate } = await request.json();

    console.log(`[Generate] ID: ${id}, BaseSequence: ${baseSequence}, Provider: ${provider}, Prompt: ${prompt}`);

    if (!id || !baseSequence || !prompt) {
      return new Response(JSON.stringify({ error: 'Missing required fields: id, baseSequence, prompt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let imageDataArray;

    if (provider === 'midjourney') {
      // Build full prompt with style description and Midjourney parameters
      const fullPrompt = `${prompt}. ${STYLE_DESCRIPTION} ${MOODBOARD_PROFILE} ${STYLE_TAGS}`;
      console.log(`[Generate] Midjourney full prompt: ${fullPrompt}`);
      imageDataArray = await generateWithMidjourney(fullPrompt, env);
    } else {
      // Gemini: combine promptTemplate + user prompt
      const fullPrompt = promptTemplate ? `${promptTemplate}\n\n${prompt}` : prompt;
      console.log(`[Generate] Gemini full prompt: ${fullPrompt}`);
      imageDataArray = await generateWithGemini(fullPrompt, env);
    }

    console.log(`[Generate] Provider returned ${imageDataArray.length} images`);

    // Store images in R2 and build response
    const images = [];
    for (let i = 0; i < imageDataArray.length; i++) {
      const sequence = baseSequence + i;
      const r2Key = `generated/${id}/${sequence}`;
      const contentType = imageDataArray[i].mimeType || 'image/png';
      await storeImageInR2(env.IMAGE_BUCKET, r2Key, imageDataArray[i].imageBuffer, prompt, contentType);
      console.log(`[Generate] Stored in R2: ${r2Key}`);

      images.push({
        sequence,
        imageUrl: `/api/image/${id}/${sequence}`,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      images,
      prompt,
      baseSequence,
      id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Generate] Error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestOptions(context) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/**
 * Generate an image using Google Gemini (gemini-3-pro-image-preview)
 * Returns an array with 1 image (Gemini generates 1 per request)
 */
async function generateWithGemini(prompt, env) {
  console.log('[Gemini] Starting generation with prompt:', prompt);

  if (!env.GEMINI_API_KEY) {
    throw new Error(`GEMINI_API_KEY not configured. Available env keys: ${Object.keys(env || {}).join(', ') || 'none'}`);
  }

  const apiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent';

  const response = await fetchWithRetry(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '1:1', imageSize: '2K' },
      },
    }),
  }, 'Gemini');

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Gemini] API error:', response.status, errorText);
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('[Gemini] Response received, parsing inline_data');

  // Extract inline_data from the response
  const candidates = data.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error(`No candidates in Gemini response: ${JSON.stringify(data)}`);
  }

  const parts = candidates[0].content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error(`No parts in Gemini response candidate: ${JSON.stringify(candidates[0])}`);
  }

  // Find the part with inline_data (image)
  const imagePart = parts.find(p => p.inline_data);
  if (!imagePart) {
    throw new Error(`No inline_data in Gemini response parts: ${JSON.stringify(parts.map(p => Object.keys(p)))}`);
  }

  const { mime_type, data: base64Data } = imagePart.inline_data;
  console.log(`[Gemini] Got image: mime_type=${mime_type}, base64 length=${base64Data.length}`);

  // Convert base64 to ArrayBuffer
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const imageBuffer = bytes.buffer;

  console.log(`[Gemini] Image decoded, size: ${imageBuffer.byteLength} bytes`);

  return [{ imageBuffer, mimeType: mime_type }];
}

/**
 * Generate images using APIFRAME Midjourney API
 * Documentation: https://docs.apiframe.pro
 * Returns an array of 4 images (Midjourney generates 4 per request)
 */
async function generateWithMidjourney(prompt, env) {
  console.log('[APIFRAME] Starting generation with prompt:', prompt);
  console.log('[APIFRAME] Environment keys available:', Object.keys(env || {}));

  if (!env.APIFRAME_API_KEY) {
    throw new Error(`APIFRAME_API_KEY not configured. Available env keys: ${Object.keys(env || {}).join(', ') || 'none'}`);
  }

  // APIFRAME Imagine endpoint
  const apiEndpoint = 'https://api.apiframe.pro/imagine';

  console.log('[APIFRAME] Calling Imagine API:', apiEndpoint);

  const response = await fetchWithRetry(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': env.APIFRAME_API_KEY,
    },
    body: JSON.stringify({
      prompt: prompt,
      // Note: aspect_ratio and other Midjourney params are included in the prompt via STYLE_TAGS
    }),
  }, 'APIFRAME Imagine');

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[APIFRAME] API error:', response.status, errorText);
    throw new Error(`APIFRAME API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('[APIFRAME] API response:', JSON.stringify(data));

  // APIFRAME returns a task_id that we need to poll
  const taskId = data.task_id;

  if (!taskId) {
    throw new Error(`No task_id in APIFRAME response: ${JSON.stringify(data)}`);
  }

  console.log('[APIFRAME] Task created, ID:', taskId);

  // Poll for the result - returns array of image URLs
  const imageUrls = await pollForResult(taskId, env);
  console.log('[APIFRAME] Got', imageUrls.length, 'image URLs');

  // Fetch all 4 images in parallel
  const imagePromises = imageUrls.map(async (url, index) => {
    console.log(`[APIFRAME] Downloading image ${index + 1}:`, url);
    const imageResponse = await fetchWithRetry(url, {}, `Image Download ${index + 1}`);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image from ${url}: ${imageResponse.status}`);
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    console.log(`[APIFRAME] Image ${index + 1} downloaded, size:`, imageBuffer.byteLength, 'bytes');
    return { imageUrl: url, imageBuffer };
  });

  return Promise.all(imagePromises);
}

/**
 * Poll APIFRAME for generation result using fetch endpoint
 * Documentation: https://docs.apiframe.pro/api-endpoints/fetch
 */
async function pollForResult(taskId, env, maxAttempts = 60, delayMs = 5000) {
  const apiEndpoint = 'https://api.apiframe.pro/fetch';

  console.log('[APIFRAME] Polling for task:', taskId);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(`[APIFRAME] Polling attempt ${attempt + 1}/${maxAttempts}`);

    const response = await fetchWithRetry(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': env.APIFRAME_API_KEY,
      },
      body: JSON.stringify({
        task_id: taskId,
      }),
    }, 'APIFRAME Fetch');

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`APIFRAME fetch failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const status = data.status;
    const percentage = data.percentage || 0;

    console.log(`[APIFRAME] Status: ${status}, Progress: ${percentage}%`);

    // APIFRAME status: "finished" when complete
    if (status === 'finished' || status === 'completed' || status === 'success') {
      console.log('[APIFRAME] Full finished response:', JSON.stringify(data));

      // APIFRAME returns:
      // - image_urls: array of 4 individual image URLs
      // - original_image_url: the grid image (2x2 of all 4 images)
      if (Array.isArray(data.image_urls) && data.image_urls.length > 0) {
        console.log('[APIFRAME] Task completed successfully, got', data.image_urls.length, 'images');
        return data.image_urls;
      }

      // Fallback to single image if image_urls not available
      const singleUrl = data.original_image_url || data.image_url || data.url;
      if (singleUrl) {
        console.log('[APIFRAME] Task completed with single image URL');
        return [singleUrl];
      }

      throw new Error(`No image URLs in response. Keys: ${Object.keys(data).join(', ')}`);
    }

    // Check for failed status
    if (status === 'failed' || status === 'error') {
      throw new Error(`APIFRAME generation failed: ${data.error || data.message || 'Unknown error'}`);
    }

    // Status is "processing" - wait before next poll
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw new Error(`Polling timeout - image generation took too long (${maxAttempts * delayMs / 1000}s)`);
}

/**
 * Store image in R2 with metadata
 */
async function storeImageInR2(bucket, key, imageBuffer, prompt, contentType = 'image/png') {
  console.log(`[R2] Storing image: ${key}, size: ${imageBuffer.byteLength} bytes, type: ${contentType}`);

  await bucket.put(key, imageBuffer, {
    httpMetadata: {
      contentType,
    },
    customMetadata: {
      prompt,
      generatedAt: new Date().toISOString(),
    },
  });

  console.log(`[R2] Stored successfully: ${key}`);
}
