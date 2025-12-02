#!/bin/bash

# Setup script for Image Generator Cloudflare Pages app
# This script helps automate the initial setup process

set -e

echo "🎨 Image Generator - Setup Script"
echo "=================================="
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Error: Wrangler CLI is not installed"
    echo "Please install it with: npm install -g wrangler"
    exit 1
fi

echo "✅ Wrangler CLI found"
echo ""

# Check if user is logged in
if ! wrangler whoami &> /dev/null; then
    echo "Please log in to Cloudflare:"
    wrangler login
fi

echo "✅ Logged in to Cloudflare"
echo ""

# Create R2 buckets
echo "📦 Creating R2 buckets..."

if wrangler r2 bucket create midjourney-images 2>/dev/null; then
    echo "✅ Created production bucket: midjourney-images"
else
    echo "ℹ️  Production bucket already exists or error creating it"
fi

if wrangler r2 bucket create midjourney-images-preview 2>/dev/null; then
    echo "✅ Created preview bucket: midjourney-images-preview"
else
    echo "ℹ️  Preview bucket already exists or error creating it"
fi

echo ""

# Apply lifecycle rules
echo "⏰ Applying 90-day lifecycle rules..."

if [ -f "r2-lifecycle-config.json" ]; then
    wrangler r2 bucket lifecycle put midjourney-images --config r2-lifecycle-config.json
    echo "✅ Applied lifecycle rules to production bucket"

    wrangler r2 bucket lifecycle put midjourney-images-preview --config r2-lifecycle-config.json
    echo "✅ Applied lifecycle rules to preview bucket"
else
    echo "❌ Error: r2-lifecycle-config.json not found"
    exit 1
fi

echo ""

# Verify lifecycle rules
echo "🔍 Verifying lifecycle configuration..."
wrangler r2 bucket lifecycle get midjourney-images

echo ""

# Create .dev.vars if it doesn't exist
if [ ! -f ".dev.vars" ]; then
    echo "📝 Creating .dev.vars file..."
    cp .dev.vars.example .dev.vars
    echo "✅ Created .dev.vars - Please edit it and add your MIDJOURNEY_API_KEY"
else
    echo "ℹ️  .dev.vars already exists"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .dev.vars and add your MIDJOURNEY_API_KEY"
echo "2. Run 'npm install' to install dependencies"
echo "3. Run 'npm run dev' to start local development"
echo "4. Run 'npm run deploy' to deploy to production"
echo ""
echo "For production, don't forget to set secrets:"
echo "  wrangler secret put MIDJOURNEY_API_KEY"
echo ""
