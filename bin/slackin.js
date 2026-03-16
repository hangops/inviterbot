#!/usr/bin/env node

'use strict';

const fs = require('fs');
const args = require('args');
const dbg = require('debug');
const slackin = require('../lib');

require('dotenv').config();

const mainLog = dbg('slackin:main');

args
  .option(['p', 'port'], 'Port to listen on', process.env.SLACKIN_PORT || process.env.PORT || 3000)
  .option(['h', 'hostname'], 'Hostname to listen on', process.env.SLACKIN_HOSTNAME || process.env.HOSTNAME || '0.0.0.0')
  .option(['c', 'channels'], 'One or more comma-separated channel names to allow single-channel guests', process.env.SLACKIN_CHANNELS)
  .option(['e', 'emails'], 'Restrict sign-up to a list of emails (comma-separated; wildcards are supported)', process.env.SLACKIN_EMAILS)
  .option(['i', 'interval'], 'How frequently (ms) to poll Slack', process.env.SLACKIN_INTERVAL || 60_000)
  .option(['P', 'path'], 'Path to serve slackin under', process.env.SLACKIN_PATH || '/')
  .option(['s', 'silent'], 'Do not print out warnings or errors', Boolean(process.env.SLACKIN_SILENT))
  .option(['x', 'cors'], 'Enable CORS for all routes', Boolean(process.env.SLACKIN_CORS))
  .option(['a', 'analytics'], 'Google Analytics ID', process.env.SLACKIN_ANALYTICS)
  .option(['R', 'recaptcha-secret'], 'reCAPTCHA secret', process.env.RECAPTCHA_SECRET)
  .option(['K', 'recaptcha-sitekey'], 'reCAPTCHA sitekey', process.env.RECAPTCHA_SITEKEY)
  .option(['I', 'recaptcha-invisible'], 'Use invisible reCAPTCHA', Boolean(process.env.RECAPTCHA_INVISIBLE))
  .option(['T', 'theme'], 'Color scheme to use, "light" (default) or "dark"', process.env.SLACKIN_THEME)
  .option(['A', 'accent'], 'Accent color to use instead of a theme default', process.env.SLACKIN_ACCENT)
  .option(['C', 'coc'], 'Full URL to a CoC that needs to be agreed to', process.env.SLACKIN_COC)
  .option(['S', 'css'], 'Full URL to a custom CSS file to use on the main page', process.env.SLACKIN_CSS)
  .option(['?', 'help'], 'Show the usage information');

const flags = args.parse(process.argv, {
  value: '<team-id> <api-token>',
  help: false,
});

// Required arguments
const org = args.sub[0] || process.env.SLACK_SUBDOMAIN;
const token = args.sub[1] || process.env.SLACK_API_TOKEN;
let blockDomains = process.env.BLOCKDOMAINS_SLACK_LIST || '';
// Try to read blockdomains in as a file.
if (blockDomains.startsWith('file://')) {
  blockDomains = fs.readFileSync(blockDomains.slice(7)).toString();
}

if (flags.help || !org || !token) {
  args.showHelp();
} else {
  flags.org = org;
  flags.token = token;
  flags.blockDomains = blockDomains;
}

// Group the reCAPTCHA settings
flags.recaptcha = {
  secret: flags.recaptchaSecret,
  sitekey: flags.recaptchaSitekey,
  invisible: Boolean(flags.recaptchaInvisible),
};

// Advanced parameters (env-only)
flags.pageDelay = process.env.SLACKIN_PAGE_DELAY;
flags.proxy = Boolean(process.env.SLACKIN_PROXY);
flags.redirectFQDN = process.env.SLACKIN_HTTPS_REDIRECT;
flags.letsencrypt = process.env.SLACKIN_LETSENCRYPT;
flags.inviteMode = process.env.SLACK_INVITE_MODE;
flags.inviteUrl = process.env.SLACK_INVITE_URL;

const {port, hostname} = flags;
slackin(flags).listen(port, hostname, err => {
  if (err) {
    throw err;
  }

  if (!flags.silent) {
    mainLog.enabled = true;
  }

  mainLog('Listening on %s:%d', hostname, port);
});
