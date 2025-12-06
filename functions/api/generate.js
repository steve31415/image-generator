/**
 * API Function: Generate Image
 * POST /api/generate
 */

// Style parameters to append to prompts
const STYLE_DESCRIPTION = "In the style of a vintage 1920 Art Deco travel poster. Bold geometric shapes, limited color palette, strong lines, sophisticated retro futurist style.";
const MOODBOARD_PROFILE = "--p a35c6a69-3196-4374-b049-bcd5b278375b m7318439057938186264";
const STYLE_TAGS = "--style raw --v 6.1 --ar 4:3 --stylize 350 --variety 30";

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { id, sequence, prompt } = await request.json();

    console.log(`[Generate] ID: ${id}, Sequence: ${sequence}, Prompt: ${prompt}`);

    if (!id || !sequence || !prompt) {
      return new Response(JSON.stringify({ error: 'Missing required fields: id, sequence, prompt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build full prompt with style parameters
    const fullPrompt = `${prompt}. ${STYLE_DESCRIPTION} ${MOODBOARD_PROFILE} ${STYLE_TAGS}`;
    console.log(`[Generate] Full prompt: ${fullPrompt}`);

    // Generate image using APIFRAME Midjourney API
    const imageData = await generateWithMidjourney(fullPrompt, env);
    console.log(`[Generate] APIFRAME API response received`);

    // Store in R2
    const r2Key = `generated/${id}/${sequence}`;
    await storeImageInR2(env.IMAGE_BUCKET, r2Key, imageData.imageBuffer, prompt);
    console.log(`[Generate] Stored in R2: ${r2Key}`);

    // Generate public URL for the image
    const imageUrl = `/api/image/${id}/${sequence}`;

    return new Response(JSON.stringify({
      success: true,
      imageUrl,
      prompt,
      sequence,
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
 * Generate image using APIFRAME Midjourney API
 * Documentation: https://docs.apiframe.pro
 */
async function generateWithMidjourney(prompt, env) {
  console.log('[APIFRAME] Starting generation with prompt:', prompt);

  if (!env.APIFRAME_API_KEY) {
    throw new Error('APIFRAME_API_KEY not configured. Please set it using: wrangler secret put APIFRAME_API_KEY');
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
      aspect_ratio: '4:3', // Matches --ar 4:3 from style tags
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

  // Poll for the result
  const imageUrl = await pollForResult(taskId, env);
  console.log('[APIFRAME] Image URL:', imageUrl);

  // Fetch the actual image data
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image from ${imageUrl}: ${imageResponse.status}`);
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  console.log('[APIFRAME] Image downloaded, size:', imageBuffer.byteLength, 'bytes');

  return {
    imageUrl,
    imageBuffer,
  };
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
      const imageUrl = data.image_url || data.url || data.imageUrl;
      if (!imageUrl) {
        throw new Error(`No image URL in finished response: ${JSON.stringify(data)}`);
      }
      console.log('[APIFRAME] Task completed successfully');
      return imageUrl;
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
