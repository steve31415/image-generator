# Deployment Guide

This guide walks you through deploying the Image Generator app to Cloudflare Pages.

## Quick Start

If you want to use the automated setup script:

```bash
npm install
npm run setup
```

Then follow the prompts and edit `.dev.vars` with your API key.

## Manual Setup (Detailed)

### Prerequisites

1. Install Node.js (v16 or later)
2. Install Wrangler CLI: `npm install -g wrangler`
3. Have a Cloudflare account
4. Have an APIFRAME API key (from https://apiframe.ai)

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Authenticate with Cloudflare

```bash
wrangler login
```

This will open a browser window for authentication.

### Step 3: Create R2 Buckets

```bash
# Option 1: Use npm script
npm run r2:create

# Option 2: Manual creation
wrangler r2 bucket create midjourney-images
wrangler r2 bucket create midjourney-images-preview
```

### Step 4: Configure R2 Lifecycle Rules

Set up automatic deletion of images after 90 days:

```bash
# Option 1: Use npm script
npm run r2:lifecycle

# Option 2: Manual setup
wrangler r2 bucket lifecycle put midjourney-images --config r2-lifecycle-config.json
wrangler r2 bucket lifecycle put midjourney-images-preview --config r2-lifecycle-config.json

# Verify the configuration
wrangler r2 bucket lifecycle get midjourney-images
```

Expected output:
```json
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
```

### Step 5: Configure Environment Variables

#### For Local Development

```bash
# Copy the example file
cp .dev.vars.example .dev.vars

# Edit .dev.vars and add your API key
nano .dev.vars
```

Add your APIFRAME API key:
```
APIFRAME_API_KEY=your_actual_api_key_here
```

#### For Production

Set production secrets:

```bash
# Required: APIFRAME API key
wrangler secret put APIFRAME_API_KEY --env production
# When prompted, paste your API key from https://apiframe.ai/dashboard
```

### Step 6: Test Locally

```bash
npm run dev
```

Visit http://localhost:8788 and test the application:
1. Enter a few test prompts
2. Click Generate Images
3. Check browser console for API calls
4. Verify images appear in the grid

### Step 7: Deploy to Production

#### Option A: Direct Deployment

```bash
npm run deploy
```

This will:
1. Upload the files to Cloudflare Pages
2. Deploy the application
3. Provide you with a URL like `https://image-generator-xxx.pages.dev`

#### Option B: Git Integration (Recommended)

1. Push your code to GitHub/GitLab:
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. Go to Cloudflare Dashboard → Pages
3. Click "Create a project"
4. Click "Connect to Git"
5. Select your repository
6. Configure settings:
   - **Project name**: image-generator
   - **Production branch**: main
   - **Build command**: (leave empty)
   - **Build output directory**: public
7. Click "Save and Deploy"

### Step 8: Configure Pages Settings

After deployment:

1. Go to your Pages project settings
2. Navigate to "Settings" → "Environment variables"
3. Add the following variables:

   **Production:**
   - `APIFRAME_API_KEY` = your_api_key (from https://apiframe.ai/dashboard)

4. Navigate to "Settings" → "Functions"
5. Scroll to "R2 bucket bindings"
6. Add binding:
   - **Variable name**: `IMAGE_BUCKET`
   - **R2 bucket**: `midjourney-images`
   - **Preview bucket**: `midjourney-images-preview`
7. Click "Save"

### Step 9: Redeploy

After adding environment variables and bindings, trigger a new deployment:

```bash
# If using direct deployment:
npm run deploy

# If using Git integration:
git commit --allow-empty -m "Trigger deployment"
git push
```

### Step 10: Verify Production Deployment

1. Visit your Pages URL
2. Test image generation with a few prompts
3. Verify images are stored in R2:
   ```bash
   wrangler r2 bucket list midjourney-images
   ```
4. Check that lifecycle rules are active:
   ```bash
   wrangler r2 bucket lifecycle get midjourney-images
   ```

## Troubleshooting

### "Failed to create bucket" Error

The bucket might already exist. Check with:
```bash
wrangler r2 bucket list
```

### "Unauthorized" Error

Make sure you're logged in:
```bash
wrangler whoami
wrangler login
```

### "Binding not found" Error

Ensure R2 bucket bindings are configured in your Pages project settings.

### Images Not Generating

1. Check browser console for errors
2. Verify your APIFRAME API key is correct
3. Check that your APIFRAME account has credits at https://apiframe.ai/dashboard
4. Review Cloudflare Pages logs:
   - Go to your Pages project → "Logs" tab

### Lifecycle Rules Not Applied

1. Verify the rules are configured:
   ```bash
   wrangler r2 bucket lifecycle get midjourney-images
   ```
2. Note: Changes can take up to 24 hours to take effect
3. Test by uploading a file with past date metadata

## Custom Domain Setup

To use a custom domain:

1. Go to Pages project → "Custom domains"
2. Click "Set up a custom domain"
3. Enter your domain (e.g., `images.example.com`)
4. Follow DNS configuration instructions
5. Wait for SSL certificate to activate

## Monitoring

### View Logs

```bash
wrangler pages deployment list
wrangler pages deployment tail
```

### Check R2 Usage

```bash
# List all buckets
wrangler r2 bucket list

# Count objects in bucket (requires additional tooling)
# Use Cloudflare Dashboard → R2 → midjourney-images
```

### Monitor Costs

1. Go to Cloudflare Dashboard → Analytics
2. Check Pages and R2 usage
3. Set up billing alerts if needed

## Updating the Application

### Update Code

```bash
# Make your changes
git add .
git commit -m "Update: description of changes"

# If using Git integration:
git push

# If using direct deployment:
npm run deploy
```

### Update Secrets

```bash
wrangler secret put APIFRAME_API_KEY --env production
```

### Update R2 Lifecycle Rules

Edit `r2-lifecycle-config.json`, then:

```bash
npm run r2:lifecycle
```

## Rollback

If something goes wrong:

1. Go to Cloudflare Dashboard → Pages → Your Project
2. Click "Deployments" tab
3. Find a previous working deployment
4. Click "⋯" → "Rollback to this deployment"

## Production Checklist

Before going live:

- [ ] Tested locally with `npm run dev`
- [ ] R2 buckets created and configured
- [ ] Lifecycle rules applied (90-day expiration)
- [ ] Environment variables set in Pages settings
- [ ] R2 bucket bindings configured
- [ ] Custom domain configured (if needed)
- [ ] Tested full image generation flow
- [ ] Verified image sharing works
- [ ] Reviewed Cloudflare billing/limits
- [ ] Set up monitoring/alerts

## Support

- Cloudflare Documentation: https://developers.cloudflare.com/pages
- Wrangler Documentation: https://developers.cloudflare.com/workers/wrangler
- R2 Documentation: https://developers.cloudflare.com/r2
