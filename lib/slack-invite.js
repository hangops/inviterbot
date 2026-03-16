'use strict';

const {WebClient} = require('@slack/web-api');

/**
 * Invite a user to Slack
 *
 * Supports two modes:
 * 1. API mode (SLACK_INVITE_MODE=api): Uses admin.users.invite API (Enterprise Grid only)
 * 2. Link mode (default): Validates email and redirects to a shared invite link
 *
 * @param {Object} options - Invite options
 * @param {string} options.org - Slack organization subdomain
 * @param {string} options.token - Slack API token
 * @param {string} options.email - Email address to invite
 * @param {string} [options.channel] - Channel ID for single-channel guest
 * @param {Function} [options.logger] - Logger function
 * @param {string} [options.inviteMode] - 'api' or 'link' (default: 'link')
 * @param {string} [options.inviteUrl] - Shared invite URL for link mode
 * @param {Function} fn - Callback function (err)
 */
function invite({org, token, email, channel, logger, inviteMode, inviteUrl}, fn) {
  const mode = inviteMode || process.env.SLACK_INVITE_MODE || 'link';

  if (mode === 'api') {
    // Enterprise Grid mode: Use admin.users.invite API
    return inviteViaAPI({
      org, token, email, channel, logger,
    }, fn);
  }

  // Default mode: Validate and redirect to shared invite link
  return inviteViaLink({
    org, email, logger, inviteUrl,
  }, fn);
}

/**
 * Invite via Slack admin.users.invite API (Enterprise Grid only)
 */
function inviteViaAPI({org, token, email, channel, logger}, fn) {
  const client = new WebClient(token);

  const options = {
    email,
    team_id: org,
  };

  if (channel) {
    options.channel_ids = [channel];
    options.is_restricted = true;
    options.is_ultra_restricted = true;
  }

  client.admin.users.invite(options)
    .then(response => {
      if (!response.ok) {
        if (logger) {
          logger(`Error sending an invite to ${email}: ${response.error}`);
        }

        if (response.error === 'missing_scope') {
          return fn(new Error('Missing admin scope: The token you provided does not have admin.users:write permission.'));
        }

        if (response.error === 'already_invited') {
          return fn(new Error('You have already been invited to Slack. Check for an email from feedback@slack.com.'));
        }

        if (response.error === 'already_in_team') {
          return fn(new Error('Sending you to Slack...'));
        }

        return fn(new Error(response.error));
      }

      if (logger) {
        logger(`Sent an invite to ${email}`);
      }

      return fn(null);
    })
    .catch(error => {
      if (logger) {
        logger(`Error sending an invite to ${email}: ${error.message}`);
      }

      return fn(error);
    });
}

/**
 * Invite via shared invite link (for non-Enterprise workspaces)
 * This validates the email and returns a success message, but the actual
 * invite happens when the user clicks the invite link.
 */
function inviteViaLink({org: _org, email, logger, inviteUrl: _inviteUrl}, fn) {
  // The email has already been validated by this point
  // Just log and return success - the client will redirect to the invite URL
  if (logger) {
    logger(`Validated invite request for ${email} (link mode)`);
  }

  // Signal to the client that they should be redirected to Slack
  // The redirect URL will be provided by the caller
  return fn(new Error('Sending you to Slack...'));
}

module.exports = invite;
