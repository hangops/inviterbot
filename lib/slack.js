'use strict';

const {EventEmitter} = require('events');
const {WebClient} = require('@slack/web-api');

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

class SlackData extends EventEmitter {
  constructor({token, interval, logger, pageDelay, fetchChannels, fetchPresence, presenceInterval, org: host}) {
    super();
    this.host = host;
    this.token = token;
    this.interval = interval;
    this.pageDelay = pageDelay;
    this.fetchChannels = fetchChannels;
    this.fetchPresence = fetchPresence;
    this.presenceInterval = presenceInterval || 86_400_000; // default 24h
    this.ready = false;
    this.org = {};
    this.users = {};
    this.channelsByName = {};

    // Initialize Slack Web API client with built-in rate limiting
    this.client = new WebClient(token, {
      retryConfig: {
        retries: 5,
        factor: 2,
      },
    });

    if (logger) {
      this.bindLogs(logger);
    }

    this.init();
    this.fetchUserCount();
    if (this.fetchPresence) {
      this.refreshPresence();
    }
  }

  async init() {
    try {
      // Fetch team info using Slack SDK
      const teamInfo = await this.client.team.info();
      if (!teamInfo.ok || !teamInfo.team) {
        throw new Error('Bad Slack response. Make sure the team name and API keys are correct');
      }

      this.org.name = teamInfo.team.name;
      if (!teamInfo.team.icon.image_default) {
        this.org.logo = teamInfo.team.icon.image_132;
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }

    // Fetch channels if needed
    if (this.fetchChannels) {
      try {
        let cursor;
        do {
          const response = await this.client.conversations.list({ // eslint-disable-line no-await-in-loop
            limit: 800,
            cursor,
          });

          if (!response.ok) {
            throw new Error(`Error fetching channels: ${response.error}`);
          }

          for (const channel of (response.channels || [])) {
            this.channelsByName[channel.name] = channel;
          }

          cursor = response.response_metadata?.next_cursor;
          if (cursor && this.pageDelay) {
            await sleep(this.pageDelay); // eslint-disable-line no-await-in-loop
          }
        } while (cursor);
      } catch (error) {
        this.emit('error', error);
        throw error;
      }
    }
  }

  async fetchUserCount() {
    let users = [];
    let cursor;

    try {
      this.emit('fetch');

      do {
        const response = await this.client.users.list({ // eslint-disable-line no-await-in-loop
          limit: 800,
          cursor,
          // Note: presence parameter is deprecated and no longer supported
        });

        if (!response.ok) {
          throw new Error(`Slack API error: ${response.error}`);
        }

        if (!response.members) {
          throw new Error('Invalid Slack response: missing members');
        }

        users = [...users, ...response.members];
        cursor = response.response_metadata?.next_cursor;

        if (cursor && this.pageDelay) {
          await sleep(this.pageDelay); // eslint-disable-line no-await-in-loop
        }
      } while (cursor);
    } catch (error) {
      this.emit('error', error);
      return this.retry();
    }

    // remove slackbot and bots from users
    // slackbot is not a bot, go figure!
    users = users.filter(x => x.id !== 'USLACKBOT' && !x.is_bot && !x.deleted);

    const total = users.length;
    const active = this.users.active || 0;

    if (this.users) {
      if (total !== this.users.total) {
        this.emit('change', 'total', total);
      }

      if (active !== this.users.active) {
        this.emit('change', 'active', active);
      }
    }

    this.users.total = total;
    this.users.active = active;

    if (!this.ready) {
      this.ready = true;
      this.emit('ready');
    }

    setTimeout(this.fetchUserCount.bind(this), this.interval);
    return this.emit('data');
  }

  async fetchPresenceCount(users) {
    let active = 0;
    const batchSize = 10;
    const batchDelay = this.pageDelay || 1200; // ~50 req/min rate limit

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      // eslint-disable-next-line no-await-in-loop
      const results = await Promise.allSettled(batch.map(user => this.client.users.getPresence({user: user.id})));

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.presence === 'active') {
          active++;
        }
      }

      if (i + batchSize < users.length) {
        await sleep(batchDelay); // eslint-disable-line no-await-in-loop
      }
    }

    return active;
  }

  async refreshPresence() {
    // Re-fetch the current user list to get presence against
    let users = [];
    let cursor;

    try {
      do {
        const response = await this.client.users.list({ // eslint-disable-line no-await-in-loop
          limit: 800,
          cursor,
        });

        if (!response.ok) {
          throw new Error(`Slack API error: ${response.error}`);
        }

        users = [...users, ...response.members];
        cursor = response.response_metadata?.next_cursor;

        if (cursor && this.pageDelay) {
          await sleep(this.pageDelay); // eslint-disable-line no-await-in-loop
        }
      } while (cursor);
    } catch (error) {
      this.emit('error', error);
      setTimeout(this.refreshPresence.bind(this), this.presenceInterval);
      return;
    }

    users = users.filter(x => x.id !== 'USLACKBOT' && !x.is_bot && !x.deleted);

    try {
      const active = await this.fetchPresenceCount(users);
      if (active !== this.users.active) {
        this.users.active = active;
        this.emit('change', 'active', active);
        this.emit('data');
      }
    } catch (error) {
      this.emit('error', error);
    }

    setTimeout(this.refreshPresence.bind(this), this.presenceInterval);
  }

  getChannelId(name) {
    const channel = this.channelsByName[name];
    return channel ? channel.id : null;
  }

  retry(delay = this.interval * 2) {
    setTimeout(this.fetchUserCount.bind(this), delay);
    return this.emit('retry');
  }

  bindLogs(logger) {
    this.on('error', err => logger('Error: %s', err.stack));
    this.on('retry', () => logger('Attempt failed, will retry'));
    this.on('fetch', () => logger('Fetching data from Slack'));
    this.on('ready', () => {
      logger('Slack is ready');
      if (!this.org.logo) {
        logger('Error: No logo exists for the Slack organization.');
      }
    });
    this.on('data', () => logger(
      'Got data from Slack: %d online, %d total',
      this.users.active,
      this.users.total,
    ));
  }
}

module.exports = SlackData;
