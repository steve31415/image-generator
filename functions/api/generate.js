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

    // Generate image using Midjourney API
    const imageData = await generateWithMidjourney(fullPrompt, env);
    console.log(`[Generate] Midjourney API response received`);

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
 * Generate image using Midjourney API
 */
async function generateWithMidjourney(prompt, env) {
  console.log('[Midjourney] Starting generation with prompt:', prompt);

  if (!env.MIDJOURNEY_API_KEY) {
    throw new Error('MIDJOURNEY_API_KEY not configured. Please set it using: wrangler secret put MIDJOURNEY_API_KEY');
  }

  // Get API endpoint from environment or use default
  const apiEndpoint = env.MIDJOURNEY_API_ENDPOINT || 'https://api.midjourneyapi.io/v2/imagine';

  console.log('[Midjourney] Calling API:', apiEndpoint);

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.MIDJOURNEY_API_KEY}`,
    },
    body: JSON.stringify({
      prompt,
      // Additional parameters based on your API provider
      // Adjust these based on your specific Midjourney API service
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Midjourney] API error:', response.status, errorText);
    throw new Error(`Midjourney API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('[Midjourney] API response:', JSON.stringify(data));

  // Parse response based on API provider
  let imageUrl = null;
  let taskId = data.task_id || data.id || data.taskId;

  // If the API returns an immediate result
  if (data.image_url || data.url || data.imageUrl) {
    imageUrl = data.image_url || data.url || data.imageUrl;
  }
  // If the API requires polling
  else if (taskId) {
    console.log('[Midjourney] Polling for result, task ID:', taskId);
    imageUrl = await pollForResult(taskId, env);
  }
  else {
    throw new Error(`Unexpected API response format: ${JSON.stringify(data)}`);
  }

  console.log('[Midjourney] Image URL:', imageUrl);

  // Fetch the actual image data
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image from ${imageUrl}: ${imageResponse.status}`);
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  console.log('[Midjourney] Image downloaded, size:', imageBuffer.byteLength, 'bytes');

  return {
    imageUrl,
    imageBuffer,
  };
}

/**
 * Poll Midjourney API for generation result
 */
async function pollForResult(taskId, env, maxAttempts = 60, delayMs = 5000) {
  const statusEndpointTemplate = env.MIDJOURNEY_API_STATUS_ENDPOINT || 'https://api.midjourneyapi.io/v2/status/{taskId}';
  const apiEndpoint = statusEndpointTemplate.replace('{taskId}', taskId);

  console.log('[Midjourney] Status endpoint:', apiEndpoint);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(`[Midjourney] Polling attempt ${attempt + 1}/${maxAttempts}`);

    const response = await fetch(apiEndpoint, {
      headers: {
        'Authorization': `Bearer ${env.MIDJOURNEY_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Status check failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[Midjourney] Status:', data.status || data.state);

    const status = data.status || data.state;

    if (status === 'completed' || status === 'success' || status === 'done') {
      const imageUrl = data.image_url || data.url || data.imageUrl || data.result?.image_url;
      if (!imageUrl) {
        throw new Error(`No image URL in completed response: ${JSON.stringify(data)}`);
      }
      return imageUrl;
    }

    if (status === 'failed' || status === 'error') {
      throw new Error(`Image generation failed: ${data.error || data.message || 'Unknown error'}`);
    }

    // Wait before next poll
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
