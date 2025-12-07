/**
 * API Function: Generate Image Batch
 * POST /api/generate
 *
 * Each APIFRAME call generates 4 images. This endpoint handles a batch of 4.
 */

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
    const { id, baseSequence, prompt } = await request.json();

    console.log(`[Generate] ID: ${id}, BaseSequence: ${baseSequence}, Prompt: ${prompt}`);

    if (!id || !baseSequence || !prompt) {
      return new Response(JSON.stringify({ error: 'Missing required fields: id, baseSequence, prompt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build full prompt with style description and Midjourney parameters
    const fullPrompt = `${prompt}. ${STYLE_DESCRIPTION} ${MOODBOARD_PROFILE} ${STYLE_TAGS}`;
    console.log(`[Generate] Full prompt: ${fullPrompt}`);

    // Generate images using APIFRAME Midjourney API (returns 4 images)
    const imageDataArray = await generateWithMidjourney(fullPrompt, env);
    console.log(`[Generate] APIFRAME API returned ${imageDataArray.length} images`);

    // Store all 4 images in R2 and build response
    const images = [];
    for (let i = 0; i < imageDataArray.length; i++) {
      const sequence = baseSequence + i;
      const r2Key = `generated/${id}/${sequence}`;
      await storeImageInR2(env.IMAGE_BUCKET, r2Key, imageDataArray[i].imageBuffer, prompt);
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

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': env.APIFRAME_API_KEY,
    },
    body: JSON.stringify({
      prompt: prompt,
      // Note: aspect_ratio and other Midjourney params are included in the prompt via STYLE_TAGS
    }),
  });

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
    const imageResponse = await fetch(url);
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

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': env.APIFRAME_API_KEY,
      },
      body: JSON.stringify({
        task_id: taskId,
      }),
    });

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
async function storeImageInR2(bucket, key, imageBuffer, prompt) {
  console.log(`[R2] Storing image: ${key}, size: ${imageBuffer.byteLength} bytes`);

  await bucket.put(key, imageBuffer, {
    httpMetadata: {
      contentType: 'image/png',
    },
    customMetadata: {
      prompt,
      generatedAt: new Date().toISOString(),
    },
  });

  console.log(`[R2] Stored successfully: ${key}`);
}
