# Quick Start Guide

Get your Image Generator app running in 5 minutes!

## Prerequisites

- Node.js installed
- Cloudflare account
- APIFRAME API key

## Installation

```bash
# 1. Install dependencies
npm install

# 2. Install Wrangler globally
npm install -g wrangler

# 3. Login to Cloudflare
wrangler login

# 4. Run automated setup
npm run setup

# 5. Edit .dev.vars and add your APIFRAME API key
nano .dev.vars
```

Add your API key to `.dev.vars`:
```
APIFRAME_API_KEY=your_actual_key_here
```

## Local Development

```bash
npm run dev
```

Visit http://localhost:8788

## Deploy to Production

### One-Time Setup

```bash
# Set production secret
wrangler secret put APIFRAME_API_KEY --env production
```

### Deploy

```bash
npm run deploy
```

## Configure Cloudflare Pages

After first deployment:

1. Go to Cloudflare Dashboard → Pages → image-generator
2. Settings → Functions → R2 bucket bindings
3. Add binding:
   - Variable name: `IMAGE_BUCKET`
   - R2 bucket: `midjourney-images`
   - Preview: `midjourney-images-preview`
4. Redeploy: `npm run deploy`

Done! Your app is live at `https://image-generator-xxx.pages.dev`

## Usage

1. Enter number of images (default 60)
2. Enter prompts (one per line)
3. Click "Generate Images"
4. Share the URL with others

## Need Help?

- See [README.md](README.md) for full documentation
- See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment guide
- Check browser console for errors (extensive logging enabled)

## Common Issues

**"Binding not found" error:**
- Configure R2 binding in Pages settings (see above)

**Images not generating:**
- Check your APIFRAME API key
- Verify API endpoint matches your provider
- Check browser console for errors

**"Module not found" error:**
- Run `npm install`
- Make sure you're in the project directory
