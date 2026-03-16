'use strict';

const nock = require('nock');
const request = require('supertest');
const slackin = require('../lib');

describe('slackin', () => {
  describe('POST /invite', () => {
    beforeEach(() => {
      // Mock Slack Web API endpoints (SDK uses POST to slack.com)
      nock('https://slack.com')
        .post('/api/users.list')
        .reply(200, {
          ok: true,
          members: [{}],
          response_metadata: {next_cursor: ''},
        });

      nock('https://slack.com')
        .post('/api/team.info')
        .reply(200, {
          ok: true,
          team: {name: 'Test Team', icon: {}},
        });
    });

    it('returns success for a successful invite (link mode)', done => {
      const opts = {
        token: 'mytoken',
        org: 'myorg',
        inviteMode: 'link', // Use link mode (default)
      };

      const app = slackin(opts);

      request(app)
        .post('/invite')
        .send({email: 'foo@example.com'})
        .expect('Content-Type', /json/)
        .expect(303, {
          msg: 'Sending you to Slack...',
          redirectUrl: 'https://myorg.slack.com/',
        })
        .end(done);
    });

    it('returns success for API mode invite', done => {
      const opts = {
        token: 'mytoken',
        org: 'myorg',
        inviteMode: 'api',
      };

      // Mock admin.users.invite API - allow any body
      nock('https://slack.com')
        .post('/api/admin.users.invite', () => true)
        .reply(200, {ok: true});

      const app = slackin(opts);

      request(app)
        .post('/invite')
        .send({email: 'foo@example.com'})
        .expect('Content-Type', /json/)
        .expect(200, {
          msg: 'WOOT. Check your email!',
          redirectUrl: 'https://myorg.slack.com/',
        })
        .end(done);
    });
  });

  describe('GET /.well-known/acme-challenge/:id', () => {
    beforeEach(() => {
      process.env.SLACKIN_LETSENCRYPT = 'letsencrypt-challenge';

      // Mock Slack Web API endpoints
      nock('https://slack.com')
        .post('/api/users.list')
        .reply(200, {
          ok: true,
          members: [{}],
          response_metadata: {next_cursor: ''},
        });

      nock('https://slack.com')
        .post('/api/team.info')
        .reply(200, {
          ok: true,
          team: {name: 'Test Team', icon: {}},
        });
    });

    it('returns the contents of the letsencrypt token', done => {
      const opts = {
        token: 'mytoken',
        org: 'myorg',
        letsencrypt: 'letsencrypt-challenge',
      };
      const app = slackin(opts);

      request(app)
        .get('/.well-known/acme-challenge/deadbeef')
        .expect(200, 'letsencrypt-challenge')
        .end(done);
    });
  });
});
