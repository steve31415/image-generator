To perform Cloudflare operations, use the Cloudflare API key in the CLOUDFLARE_API_TOKEN environment variable. If the key has insufficient permissions, tell me so I can fix the permissions.

If you encounter network issues, tell me which domain you need to access so I can whitelist it – you won't be able to bypass the proxy.

# Deploying to Staging
To deploy to a staging environment for testing:

```npx wrangler pages deploy public --project-name=image-generator --branch=staging```

This creates two URLs:

- Hash URL: https://<hash>.image-generator-77r.pages.dev (unique per deployment)
- Branch alias: https://staging.image-generator-77r.pages.dev (stable URL)
Use the branch alias for consistent testing. The --branch flag can be any name (e.g., --branch=feature-test), which creates a corresponding alias URL.

If the deployment fails with a network error, retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s).

Key points:

Deploy from public directory (not root)
Use --project-name=image-generator to target the correct Pages project
The --branch name becomes part of the alias URL (e.g., staging → staging.image-generator-77r.pages.dev)
