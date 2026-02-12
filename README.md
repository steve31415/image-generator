# Image Generator

A Cloudflare Pages application that generates images using multiple providers. Images are stored in Cloudflare R2 with automatic 90-day expiration.

## Providers

- **Nano Banana Pro** (default): Uses Google Gemini (`gemini-3-pro-image-preview`). Generates 1 image per API call. Supports custom prompt templates configured in settings.
- **Midjourney**: Uses APIFRAME (https://apiframe.ai). Generates 4 images per API call. Uses hardcoded Art Deco travel poster style by default, configurable via settings.

## Features

- **Multiple Providers**: Choose between Nano Banana Pro (Gemini) and Midjourney
- **Prompt Templates**: Configure per-provider prompt templates in settings (stored in localStorage)
- **Batch Generation**: Evenly distribute images across multiple prompts
- **Concurrency Control**: Limits parallel API calls per provider (Gemini: 10, Midjourney: 15)
- **Real-time Progress**: Watch as images populate in a grid as they're generated
- **Shareable Results**: Each generation gets a unique URL for sharing
- **R2 Storage**: Images stored with metadata and automatic 90-day expiration

## Architecture

- **Frontend**: Single-page HTML/CSS/JS application served from Cloudflare Pages
- **Backend**: Cloudflare Pages Functions for API endpoints
- **Storage**: Cloudflare R2 for image storage with metadata
- **Image Generation**: Google Gemini API (Nano Banana Pro) and Midjourney API via APIFRAME

## Project Structure

```
image-generator/
├── public/                 # Static files
│   └── index.html         # Main web application
├── functions/             # Cloudflare Pages Functions
│   └── api/
│       ├── generate.js    # POST /api/generate - Generate images
│       └── image/
│           └── [id]/
│               └── [sequence].js  # GET /api/image/:id/:seq - Retrieve images
├── wrangler.toml          # Cloudflare configuration
├── package.json           # Node dependencies
└── README.md             # This file
```

## Prerequisites

1. **Cloudflare Account**: Sign up at https://cloudflare.com
2. **Wrangler CLI**: Install globally with `npm install -g wrangler`
3. **At least one API key**:
   - **Gemini API Key** (for Nano Banana Pro): Get from https://aistudio.google.com/apikey
   - **APIFRAME API Key** (for Midjourney): Get from https://apiframe.ai/dashboard

## Setup Instructions

### 1. Clone and Install

```bash
git clone <repository-url>
cd image-generator
npm install
```

### 2. Create R2 Buckets

Create the R2 buckets for production and preview:

```bash
# Create production bucket
wrangler r2 bucket create midjourney-images

# Create preview bucket for development
wrangler r2 bucket create midjourney-images-preview
```

### 3. Configure R2 Lifecycle Rules (90-Day Expiration)

Set up automatic deletion of images after 90 days:

```bash
# Create lifecycle configuration file
cat > lifecycle-config.json << 'EOF'
{
  "rules": [
    {
      "id": "expire-after-90-days",
      "status": "Enabled",
      "filter": {
        "prefix": "generated/"
      },
      "expiration": {
        "days": 90
      }
    }
  ]
}
EOF

# Apply lifecycle rules to production bucket
wrangler r2 bucket lifecycle put midjourney-images --config lifecycle-config.json

# Apply to preview bucket as well
wrangler r2 bucket lifecycle put midjourney-images-preview --config lifecycle-config.json

# Verify the configuration
wrangler r2 bucket lifecycle get midjourney-images
```

### 4. Configure Environment Variables

For local development, create a `.dev.vars` file:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and add your API keys:

```
GEMINI_API_KEY=your_gemini_key_here
APIFRAME_API_KEY=your_apiframe_key_here
```

For production deployment, set secrets using Wrangler:

```bash
# Set Gemini API key (for Nano Banana Pro)
wrangler secret put GEMINI_API_KEY

# Set APIFRAME API key (for Midjourney)
wrangler secret put APIFRAME_API_KEY
```

### 5. Local Development

Run the development server:

```bash
npm run dev
```

Visit http://localhost:8788 to test the application locally.

### 6. Deploy to Cloudflare Pages

Deploy the application:

```bash
npm run deploy
```

Alternatively, connect your repository to Cloudflare Pages for automatic deployments:

1. Go to Cloudflare Dashboard → Pages
2. Click "Create a project"
3. Connect your Git repository
4. Configure build settings:
   - **Build command**: (leave empty)
   - **Build output directory**: `public`
5. Add environment variables in Pages settings:
   - `APIFRAME_API_KEY` (get from https://apiframe.ai/dashboard)
6. Add R2 bucket binding:
   - Variable name: `IMAGE_BUCKET`
   - R2 bucket: `midjourney-images`

## Usage

### Generating Images

1. Navigate to the deployed application URL
2. Select a provider (Nano Banana Pro or Midjourney)
3. Enter the number of images you want to generate
4. Enter your prompts, one per line
5. Click "Generate Images"
6. Watch as images populate in the grid
7. The URL will update to include a unique ID for sharing

### Settings

Click "Settings" on the main page to configure prompt templates:

- **Nano Banana Pro template**: Text prepended to your prompt when using Gemini. Empty by default.
- **Midjourney template**: Style description for Midjourney. Pre-filled with Art Deco travel poster style.

Settings are stored in your browser's localStorage and persist across sessions.

### Sharing Results

Once generation is complete, share the URL with others. The URL format is:
```
https://your-app.pages.dev/generate?id=XXX&count=YYY
```

Anyone with this URL can view the generated images.

### Image Details

- **Hover** over a thumbnail to see the prompt
- **Click** a thumbnail to open the full-sized image in a new tab with the prompt displayed

## API Endpoints

### POST /api/generate

Generate a batch of images.

**Request Body:**
```json
{
  "id": "unique-generation-id",
  "baseSequence": 1,
  "prompt": "Mountain landscape at sunset",
  "provider": "gemini",
  "promptTemplate": "Optional template prepended to prompt"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique generation ID |
| `baseSequence` | Yes | Starting sequence number for this batch |
| `prompt` | Yes | User's image prompt |
| `provider` | No | `"gemini"` (default) or `"midjourney"` |
| `promptTemplate` | No | Template text prepended to prompt (Gemini only; Midjourney uses hardcoded style) |

**Response:**
```json
{
  "success": true,
  "images": [
    { "sequence": 1, "imageUrl": "/api/image/unique-generation-id/1" }
  ],
  "prompt": "Mountain landscape at sunset",
  "baseSequence": 1,
  "id": "unique-generation-id"
}
```

Gemini returns 1 image per call; Midjourney returns 4.

### GET /api/image/:id/:sequence

Retrieve a generated image.

**Parameters:**
- `id`: Unique generation ID
- `sequence`: Image sequence number

**Query Parameters:**
- `format=json`: Return JSON with base64-encoded image

**Response (default):**
Binary image data with headers:
- `Content-Type`: image/png
- `X-Prompt`: The prompt used to generate the image
- `X-Generated-At`: Timestamp of generation

**Response (format=json):**
```json
{
  "imageUrl": "data:image/png;base64,...",
  "prompt": "Mountain landscape at sunset",
  "sequence": 1,
  "id": "unique-generation-id",
  "generatedAt": "2024-01-01T00:00:00.000Z"
}
```

## Style Parameters (Midjourney)

When using the Midjourney provider, images are generated with the following hardcoded style parameters:

**Style Description:**
> In the style of a vintage 1920 Art Deco travel poster. Bold geometric shapes, limited color palette, strong lines, sophisticated retro futurist style.

**Moodboard + Profile Tags:**
```
--p a35c6a69-3196-4374-b049-bcd5b278375b m7318439057938186264
```

**Style + Variety Tags:**
```
--style raw --v 6.1 --ar 4:3 --stylize 350 --variety 30
```

## Customization

### Prompt Templates (Settings Page)

Use the in-app Settings page to configure prompt templates for each provider. Templates are stored in localStorage.

### Midjourney Style Parameters

Edit the constants in `functions/api/generate.js`:

```javascript
const STYLE_DESCRIPTION = "Your custom style description";
const MOODBOARD_PROFILE = "--p your-profile-id";
const STYLE_TAGS = "--style raw --v 6.1 --ar 16:9";
```

### APIFRAME Configuration

The application is pre-configured to use APIFRAME's endpoints:
- **Imagine API**: `https://api.apiframe.pro/imagine`
- **Fetch API**: `https://api.apiframe.pro/fetch`

For APIFRAME account management, credits, and usage tracking, visit:
- Dashboard: https://apiframe.ai/dashboard
- Documentation: https://docs.apiframe.pro

## Troubleshooting

### Images Not Generating

1. Check browser console for errors (extensive logging is enabled)
2. Verify the correct API key is set for your selected provider:
   - Nano Banana Pro: `GEMINI_API_KEY`
   - Midjourney: `APIFRAME_API_KEY`
3. Check Cloudflare Pages logs for backend errors
4. Check browser console for detailed API error messages

### Images Not Storing

1. Verify R2 bucket bindings are configured
2. Check that buckets `midjourney-images` and `midjourney-images-preview` exist
3. Review Cloudflare logs for R2 errors

### Lifecycle Rules Not Working

1. Verify lifecycle configuration: `wrangler r2 bucket lifecycle get midjourney-images`
2. Note: R2 lifecycle rules may take up to 24 hours to take effect
3. Objects are deleted asynchronously and may not disappear immediately at 90 days

## Cost Estimation

### Cloudflare Costs

- **Pages**: Free tier includes 500 builds/month, unlimited requests
- **R2 Storage**:
  - $0.015 per GB-month stored
  - Free tier: 10 GB-month storage
- **R2 Operations**:
  - Class A (writes): $4.50 per million
  - Class B (reads): $0.36 per million
  - Free tier: 1M Class A, 10M Class B per month

### Midjourney API Costs

Check your APIFRAME pricing at https://apiframe.ai for current rates.

### Example Calculation

For 1,000 images (each ~2MB) generated and shared 10,000 times:
- Storage: 2GB = ~$0.03/month (after free tier)
- Writes (1,000): Free (within free tier)
- Reads (10,000): Free (within free tier)
- **Total Cloudflare Cost**: ~$0.03/month + Midjourney API costs

## Security Considerations

1. **API Key Protection**: Never commit `.dev.vars` or expose your API keys
2. **Rate Limiting**: Consider implementing rate limiting for production use
3. **Input Validation**: Prompts are passed to Midjourney API - consider content filtering
4. **CORS**: Currently allows all origins - restrict in production if needed

## License

MIT

## Support

For issues and questions:
1. Check the Cloudflare documentation: https://developers.cloudflare.com
2. Review APIFRAME documentation at https://docs.apiframe.pro
3. Open an issue in the repository
