# Deployment Guide

## Cloud Run Deployment

### Prerequisites

- GCP project: `hangops-jobbot`
- Region: `us-west1`
- Docker image: `gcr.io/hangops-jobbot/inviterbot`

### Secrets

The following secrets must be configured in Secret Manager:
- `inviterbot-slack-api-key` - Slack API token
- `inviterbot-captcha-sitekey` - reCAPTCHA site key
- `inviterbot-captcha-secret` - reCAPTCHA secret key

### Manual Deployment

1. **Build and push the Docker image:**
   ```bash
   gcloud builds submit --config cloudbuild.yaml --project hangops-jobbot
   ```

2. **Deploy to Cloud Run:**
   ```bash
   gcloud run services update inviterbot \
     --image gcr.io/hangops-jobbot/inviterbot:latest \
     --region us-west1 \
     --project hangops-jobbot
   ```

3. **Or deploy using the service YAML:**
   ```bash
   gcloud run services replace cloudrun/service.yaml \
     --region us-west1 \
     --project hangops-jobbot
   ```

### Environment Variables

The service uses the following environment variables:

#### Slack Configuration
- `SLACK_SUBDOMAIN` - Slack workspace subdomain
- `SLACK_API_TOKEN` - Slack API token (from Secret Manager)
- `SLACK_CHANNELS` - Comma-separated list of channels for single-channel guests

#### Application Configuration
- `SLACKIN_PORT` or `PORT` - Port to listen on (default: 3000)
- `SLACKIN_HOSTNAME` or `HOSTNAME` - Hostname to bind to (default: 0.0.0.0)
- `SLACKIN_INTERVAL` - How frequently (ms) to poll Slack (default: 60000)
- `SLACKIN_COC` - Full URL to Code of Conduct that needs to be agreed to
- `SLACKIN_CSS` - Full URL to custom CSS file

#### reCAPTCHA Configuration
- `RECAPTCHA_SITEKEY` - reCAPTCHA site key (from Secret Manager)
- `RECAPTCHA_SECRET` - reCAPTCHA secret (from Secret Manager)
- `RECAPTCHA_INVISIBLE` - Use invisible reCAPTCHA (true/false)

#### Domain Blocking
- `BLOCKDOMAINS_SLACK_LIST` - Path to blocklist file or comma-separated domains
  - Use `file:///blockdomains.txt` to read from the included file

### Local Development

1. **Build the Docker image:**
   ```bash
   docker build -t inviterbot .
   ```

2. **Run locally:**
   ```bash
   docker run -p 3000:3000 \
     -e SLACK_SUBDOMAIN=your-workspace \
     -e SLACK_API_TOKEN=your-token \
     -e RECAPTCHA_SITEKEY=your-sitekey \
     -e RECAPTCHA_SECRET=your-secret \
     inviterbot
   ```

3. **Or run with npm:**
   ```bash
   npm install
   npm run build
   SLACK_SUBDOMAIN=your-workspace SLACK_API_TOKEN=your-token npm start
   ```

### Health Checks

The application exposes a `/data` endpoint that returns the current Slack user count. Cloud Run uses a TCP health check on port 3000.

### Notes

- The container runs as a non-root user (`appuser`) for security
- Production dependencies have 0 vulnerabilities
- Min instances: 1 (no cold starts)
- Max instances: 100 (auto-scaling)
- Resources: 1 CPU / 512Mi memory
