/**
 * API Function: Retrieve Image
 * GET /api/image/:id/:sequence
 */

export async function onRequestGet(context) {
  const { request, env, params } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { id, sequence } = params;

    console.log(`[GetImage] ID: ${id}, Sequence: ${sequence}`);

    if (!id || !sequence) {
      return new Response(JSON.stringify({ error: 'Invalid image path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Retrieve from R2
    const r2Key = `generated/${id}/${sequence}`;
    console.log(`[GetImage] Fetching from R2: ${r2Key}`);

    const object = await env.IMAGE_BUCKET.get(r2Key);

    if (!object) {
      console.error(`[GetImage] Not found: ${r2Key}`);
      return new Response(JSON.stringify({ error: 'Image not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get metadata
    const prompt = object.customMetadata?.prompt || 'No prompt available';
    const generatedAt = object.customMetadata?.generatedAt || 'Unknown';
    console.log(`[GetImage] Retrieved: ${r2Key}, Prompt: ${prompt}, Generated: ${generatedAt}`);

    // Check if request wants JSON or image
    const url = new URL(request.url);
    const format = url.searchParams.get('format');

    if (format === 'json') {
      // Return JSON with base64 image
      const arrayBuffer = await object.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);

      return new Response(JSON.stringify({
        imageUrl: `data:image/png;base64,${base64}`,
        prompt,
        sequence,
        id,
        generatedAt,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Return raw image
    return new Response(object.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': object.httpMetadata?.contentType || 'image/png',
        'Cache-Control': 'public, max-age=31536000',
        'X-Prompt': encodeURIComponent(prompt),
        'X-Generated-At': generatedAt,
      },
    });

  } catch (error) {
    console.error('[GetImage] Error:', error);
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/**
 * Convert ArrayBuffer to base64
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
