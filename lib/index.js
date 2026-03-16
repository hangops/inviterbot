'use strict';

// their code
const {Server: http} = require('http');
const {readFileSync: read} = require('fs');
const sysPath = require('path');
const dns = require('dns').promises;
const express = require('express');
const logger = require('morgan');
const compression = require('compression');
const favicon = require('serve-favicon');
const {json} = require('body-parser');
const remail = require('email-regex');
const cors = require('cors');
const dbg = require('debug');
const tinycolor = require('tinycolor2');
const match = require('micromatch');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
// our code
const Slack = require('./slack');
const invite = require('./slack-invite');
const themes = require('./themes');

const mainLog = dbg('slackin:main');
const inviteLog = dbg('slackin:invite');
const slackLog = dbg('slackin:slack');

function slackin({
  token,
  org,
  path = '/',
  interval = 60_000,
  cors: useCors = false,
  recaptcha = {},
  analytics,
  theme: themeID,
  accent,
  css,
  channels,
  emails,
  blockDomains,
  coc,
  proxy,
  pageDelay = 0,
  redirectFQDN,
  letsencrypt,
  silent,
  server,
  inviteMode,
  inviteUrl,
}) {
  // must haves
  if (!token) {
    throw new Error('Must provide a `token`.');
  }

  if (!org) {
    throw new Error('Must provide an `org`.');
  }

  if (
    Boolean(recaptcha.secret || recaptcha.sitekey || recaptcha.invisible)
    !== Boolean(recaptcha.secret && recaptcha.sitekey)
  ) {
    throw new Error('Both `recaptcha-secret` and `recaptcha-sitekey` must be defined to enable reCAPTCHA.');
  }

  const relativePath = path.endsWith('/') ? path : `${path}/`;

  if (!silent) {
    inviteLog.enabled = true;
    slackLog.enabled = true;
    mainLog.enabled = true;
  }

  let channelsFiltered;
  if (channels) {
    channelsFiltered = channels.split(',').map(channel => (
      channel.startsWith('#') ? channel.slice(1) : channel
    ));
  }

  let acceptedEmails;
  if (emails) {
    acceptedEmails = emails.split(',');
  }

  if (blockDomains) {
    // convert to an hash for fast lookups
    const blockDomainsHash = {};
    for (const d of blockDomains.split(/[,\n]/)) {
      if (!d.startsWith('#')) {
        blockDomainsHash[d] = true;
      }
    }

    blockDomains = blockDomainsHash;
  }

  let theme;
  if (themeID) {
    if (themeID in themes) {
      theme = themes[themeID];
    } else {
      mainLog(`Specified theme (${themeID}) not found, falling back to default`);
    }
  } else {
    theme = themes.DEFAULT;
  }

  mainLog(`Theme: ${theme.name}`);
  if (accent) {
    theme.accent = tinycolor(accent).toHexString();
    mainLog(`Using a custom theme accent: ${accent}`);
  }

  theme.accentDark = tinycolor(theme.accent).darken(10).toHexString();

  // setup
  const app = express();
  const srv = server || http(app);
  srv.app = app;

  if (process.env.NODE_ENV === 'production') {
    app.use(logger('combined'));
  } else {
    app.use(logger('dev'));
  }

  app.set('views', sysPath.join(__dirname, '/../views'));
  app.set('view engine', 'pug');
  app.set('json escape', true);
  app.set('json spaces', 2);

  // Trust proxy for Cloud Run / load balancers
  app.set('trust proxy', 1);

  app.use(compression());

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['\'self\''],
        scriptSrc: ['\'self\'', '\'unsafe-inline\'', 'https://www.google.com', 'https://www.gstatic.com'],
        styleSrc: ['\'self\'', '\'unsafe-inline\''],
        imgSrc: ['\'self\'', 'data:', 'https:'],
        connectSrc: ['\'self\''],
        frameSrc: ['https://www.google.com'],
        fontSrc: ['\'self\''],
        objectSrc: ['\'none\''],
        baseUri: ['\'self\''],
        formAction: ['\'self\''],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  if (useCors) {
    app.options('*', cors());
    app.use(cors());
  }

  if (proxy) {
    app.enable('trust proxy');
    if (redirectFQDN) {
      app.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] === 'http') {
          res.redirect(301, `https://${redirectFQDN}${req.url}`);
        } else {
          next();
        }
      });
    }
  }

  // static files
  const assets = sysPath.join(__dirname, '/../assets');

  app.use('/assets', express.static(assets));
  app.use('/slackin.js', express.static(`${assets}/badge.js`));
  app.use(favicon(sysPath.join(__dirname, '/../assets/favicon.ico'), '7d'));

  if (letsencrypt) {
    app.get('/.well-known/acme-challenge/:id', (req, res) => {
      res.send(letsencrypt);
    });
  }

  // fetch data
  mainLog('Establishing connection with Slack');
  const slack = new Slack({
    token,
    interval,
    org,
    pageDelay,
    fetchChannels: Boolean(channels),
    logger: slackLog,
  });
  slack.setMaxListeners(Number.POSITIVE_INFINITY);

  // middleware for waiting for slack
  app.use((req, res, next) => {
    if (slack.ready) {
      return next();
    }

    return slack.once('ready', next);
  });

  app.get('/', (req, res) => {
    const {name, logo} = slack.org;
    const {active, total} = slack.users;

    if (!name) {
      return res.send(404);
    }

    return res
      .type('html')
      .render('main', {
        coc,
        path: relativePath,
        name,
        org,
        logo,
        active,
        total,
        recaptcha,
        css,
        analytics,
        channels: channelsFiltered,
        theme,
      });
  });

  app.get('/data', (req, res) => {
    const {name, logo} = slack.org;
    const {active, total} = slack.users;

    res.send({
      name,
      org,
      coc,
      logo,
      active,
      total,
      channelsFiltered,
    });
  });

  // Helper function to check if email domain is blocked
  async function isBlockedEmail(email, blockDomains) {
    if (!blockDomains) {
      return false;
    }

    const hostname = email.split(/@/).pop();

    // Check direct domain match
    if (blockDomains[hostname]) {
      return true;
    }

    // Check MX records
    try {
      const mxAddresses = await dns.resolveMx(hostname);
      if (mxAddresses && mxAddresses.some(mx => blockDomains[mx.exchange])) {
        return true;
      }
    } catch {
      // Ignore DNS errors to avoid false positives
    }

    return false;
  }

  // Rate limiting for invite endpoint
  const inviteLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 requests per minute per IP
    message: {msg: 'Too many invite requests, please try again later.'},
    standardHeaders: true,
    legacyHeaders: false,
  });

  // invite endpoint
  app.post('/invite', json(), inviteLimiter, async (req, res) => {
    const {channel, email} = req.body;
    const captchaResponse = req.body['g-recaptcha-response'];
    let errorMessage = null;

    // Validation checks
    if (channelsFiltered && !channelsFiltered.includes(channel)) {
      errorMessage = 'Not a permitted channel';
    } else if (channelsFiltered && !slack.getChannelId(channel)) {
      errorMessage = `Channel "${channel}" not found`;
    } else if (!email) {
      errorMessage = 'No email provided';
    } else if (recaptcha.secret && (!captchaResponse || captchaResponse.length === 0)) {
      errorMessage = 'Invalid captcha';
    } else if (!remail().test(email)) {
      errorMessage = 'Invalid email';
    } else if (emails && !match.any(email, acceptedEmails)) {
      errorMessage = 'Your email is not on the accepted list.';
    } else if (coc && Number(req.body.coc) !== 1) {
      errorMessage = 'Agreement to CoC is mandatory';
    }

    if (errorMessage) {
      return res.status(400).json({msg: errorMessage});
    }

    // Check blocked domains (now properly async)
    const blockedEmail = await isBlockedEmail(email, blockDomains);
    if (blockedEmail) {
      // Spammer, return success but do nothing
      return res.status(200).json({
        msg: 'WOOT. Check your email!',
        redirectUrl: `https://${org}.slack.com/`,
      });
    }

    // Verify reCAPTCHA if enabled
    if (recaptcha.secret) {
      try {
        const captchaParams = new URLSearchParams({
          secret: recaptcha.secret,
          response: captchaResponse,
          remoteip: req.ip,
        });

        const captchaResult = await fetch('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST',
          body: captchaParams,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });

        const captchaBody = await captchaResult.json();

        // Check if reCAPTCHA verification was successful
        if (!captchaBody || !captchaBody.success) {
          return res.status(400).json({
            msg: 'reCAPTCHA verification failed',
          });
        }
      } catch {
        return res.status(400).json({
          msg: 'Error verifying reCAPTCHA',
        });
      }
    }

    // Send invite
    invite({
      token,
      org,
      email,
      logger: inviteLog,
      channel: slack.getChannelId(channel),
      inviteMode,
      inviteUrl,
    }, inviteErr => {
      if (inviteErr) {
        if (inviteErr.message === 'Sending you to Slack...') {
          // Use the configured invite URL if available, otherwise fallback to Slack URL
          const redirectTarget = inviteUrl || `https://${org}.slack.com/`;
          return res.status(303).json({
            msg: inviteErr.message,
            redirectUrl: redirectTarget,
          });
        }

        return res.status(400).json({
          msg: inviteErr.message,
          redirectUrl: `https://${org}.slack.com/`,
        });
      }

      return res.status(200).json({
        msg: 'WOOT. Check your email!',
        redirectUrl: `https://${org}.slack.com/`,
      });
    });
  });

  // iframe
  const logo = read(sysPath.join(__dirname, '/../assets/slack.svg')).toString('base64');
  const js = read(sysPath.join(__dirname, '/../assets/iframe.js')).toString();
  const extraCss = read(sysPath.join(__dirname, '/../assets/iframe-button.css')).toString();
  app.get('/iframe', (req, res) => {
    const large = 'large' in req.query;
    const {active, total} = slack.users;

    res.type('html');
    res.render('iframe', {
      path: relativePath,
      active,
      total,
      large,
      logo,
      js,
      extraCss,
      css,
    });
  });

  app.get('/iframe/dialog', (req, res) => {
    const large = 'large' in req.query;
    const {name} = slack.org;
    const {active, total} = slack.users;
    if (!name) {
      res.sendStatus(404);
      return;
    }

    res.type('html');
    res.render('main', {
      coc,
      path: relativePath,
      name,
      org,
      active,
      total,
      large,
      recaptcha,
      analytics,
      channels: channelsFiltered,
      theme,
      iframe: true,
    });
  });

  // badge rendering
  app.get('/badge.svg', (req, res) => {
    res.type('svg');
    res.set('Cache-Control', 'max-age=0, no-cache');
    res.set('Pragma', 'no-cache');

    const options = {
      total: slack.users.total,
      active: slack.users.active,
      bg: req.query.bg ? tinycolor(req.query.bg).toHexString() : theme.accent,
    };

    if (req.query.fg) {
      options.fg = tinycolor(req.query.fg).toHexString();
    } else {
      options.fg = tinycolor(options.bg).isDark() ? '#fff' : '#333';
    }

    res.render('badge-svg', options);
  });

  // Custom error handler (replaces errorhandler to prevent stack trace exposure)
  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    // Log error internally
    mainLog('Error:', err.message);
    if (!silent) {
      console.error(err);
    }

    // Send generic error response (don't expose stack trace)
    res.status(err.status || 500).json({
      msg: process.env.NODE_ENV === 'production'
        ? 'An error occurred'
        : err.message,
    });
  });

  return srv;
}

module.exports = slackin;
