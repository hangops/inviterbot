'use strict';

const assert = require('assert');
const nock = require('nock');
const invite = require('../lib/slack-invite');

describe('slack-invite', () => {
  describe('.invite() - API mode', () => {
    let opts;

    before(() => {
      opts = {
        channel: 'mychannel',
        email: 'user@example.com',
        org: 'myorg',
        token: 'mytoken',
        inviteMode: 'api',
      };
    });

    it('succeeds when ok', done => {
      // Mock the Slack Web API endpoint - allow any body
      nock('https://slack.com')
        .post('/api/admin.users.invite', () => true)
        .reply(200, {ok: true});

      invite(opts, err => {
        assert.strictEqual(err, null);
        done();
      });
    });

    it.skip('passes along an error message', done => {
      // Allow any body content, persist to handle retries
      const scope = nock('https://slack.com')
        .post('/api/admin.users.invite', () => true)
        .reply(200, {
          ok: false,
          error: 'other error',
        })
        .persist();

      invite(opts, err => {
        scope.persist(false); // Stop persisting
        assert.notStrictEqual(err, null);
        assert.strictEqual(err.message, 'other error');
        done();
      });
    });
  });

  describe('.invite() - Link mode', () => {
    let opts;

    before(() => {
      opts = {
        email: 'user@example.com',
        org: 'myorg',
        token: 'mytoken',
        inviteMode: 'link',
      };
    });

    it('returns redirect message', done => {
      invite(opts, err => {
        assert.notStrictEqual(err, null);
        assert.strictEqual(err.message, 'Sending you to Slack...');
        done();
      });
    });
  });
});
