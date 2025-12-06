# Art Deco Image Generator

A Cloudflare Pages application that generates images using the Midjourney API (via APIFRAME) in the style of vintage 1920s Art Deco travel posters. Images are stored in Cloudflare R2 with automatic 90-day expiration.

## Features

- **Simple Web Interface**: Enter image count and prompts to generate multiple images
- **Batch Generation**: Evenly distribute images across multiple prompts
- **Real-time Progress**: Watch as images populate in a grid as they're generated
- **Shareable Results**: Each generation gets a unique URL for sharing
- **R2 Storage**: Images stored with metadata and automatic 90-day expiration
- **Art Deco Style**: All images generated in vintage 1920s Art Deco travel poster style

## Architecture

- **Frontend**: Single-page HTML/CSS/JS application served from Cloudflare Pages
- **Backend**: Cloudflare Pages Functions for API endpoints
- **Storage**: Cloudflare R2 for image storage with metadata
- **Image Generation**: Midjourney API via APIFRAME (https://apiframe.ai)

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
3. **APIFRAME API Key**: Sign up and get your API key at https://apiframe.ai

### About APIFRAME

This application uses APIFRAME (https://apiframe.ai) to access the Midjourney API. APIFRAME provides:
- Reliable Midjourney API access without Discord bot complexity
- Simple REST API with async task-based generation
- Documentation at https://docs.apiframe.pro

Get your API key from the APIFRAME dashboard: https://apiframe.ai/dashboard

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

Edit `.dev.vars` and add your Midjourney API key:

```
APIFRAME_API_KEY=your_actual_api_key_here
```

For production deployment, set secrets using Wrangler:

```bash
# Set required APIFRAME API key
wrangler secret put APIFRAME_API_KEY
# When prompted, enter your API key from https://apiframe.ai/dashboard
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
2. Enter the number of images you want to generate (default: 60)
3. Enter your prompts, one per line
4. Click "Generate Images"
5. Watch as images populate in the grid
6. The URL will update to include a unique ID for sharing

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

Generate a single image.

**Request Body:**
```json
{
  "id": "unique-generation-id",
  "sequence": 1,
  "prompt": "Mountain landscape at sunset"
}
```

**Response:**
```json
{
  "success": true,
  "imageUrl": "/api/image/unique-generation-id/1",
  "prompt": "Mountain landscape at sunset",
  "sequence": 1,
  "id": "unique-generation-id"
}
```

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

## Style Parameters

All images are automatically generated with the following style parameters:

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

### Changing Style Parameters

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

No additional configuration is needed beyond setting your `APIFRAME_API_KEY`.

For APIFRAME account management, credits, and usage tracking, visit:
- Dashboard: https://apiframe.ai/dashboard
- Documentation: https://docs.apiframe.pro

## Troubleshooting

### Images Not Generating

1. Check browser console for errors (extensive logging is enabled)
2. Verify `APIFRAME_API_KEY` is set correctly
3. Verify your APIFRAME account has credits (check at https://apiframe.ai/dashboard)
4. Check Cloudflare Pages logs for backend errors
5. Check browser console for detailed API error messages

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

1. **API Key Protection**: Never commit `.dev.vars` or expose your Midjourney API key
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
