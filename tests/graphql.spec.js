import { set } from 'vitest-plugin-set';
import {expect, describe, it, beforeEach} from 'vitest';
import {mockServer, graphqlEndpoint, endpointUrl} from 'tests/mock_server';
import {mockRandom, resetMockRandom} from 'jest-mock-random';

// import graphql from '../src/graphql.js';
const graphql = require('../src/graphql');

let requests= [];
let payloads = {
    posts: ({id}) => ({id, title: 'hi', text: 'hello'}),
    comments: (_) => ([{ comment: 'hi', owner: { name: 'bob' } }]),
};

beforeEach(() => {
    requests = [];
    mockServer.use(
        graphqlEndpoint.operation(async (req, res, ctx) => {
            const request = {
                method: req.method,
                url: req.url.toString(),
                authentication: req.headers.get('Authorization'),
                operationName: req.operationName,
                variables: req.variables,
                query: req.method === 'GET' ? req.url.searchParams.get('query') : (await req.json())?.query,
            };
            requests.push(request);
            let response = {};
            if (request.query.match(/merge/)) {
                if (request.query.match(/merge1234_post/)) {
                    response.merge1234_post = payloads.posts.call(null, {id: request.variables.merge1234__id});
                }
                if (request.query.match(/merge4321_commentsOfPost/)) {
                    response.merge4321_commentsOfPost = payloads.comments.call(null, {postId: request.variables.merge4321__postId});
                }
            } else if (request.query.match(/\$id/)) {
                response.post = payloads.posts.call(null, request.variables);
            } else if (request.query.match(/\$postId/)) {
                response.commentsOfPost = payloads.comments.call(null, request.variables);
            }
            return res(ctx.data(response));
        }),
    );
});

/* global client, method, url, fetchPost, fetchComments */
describe('graphql.js', () => {
    set('url', () => null);
    set('method', () => 'POST');
    set('client', () =>
        graphql(url, {
            method: method,
            asJSON: true,
            fragments: {
                user: 'on User {name}',
                auth: {
                    user: 'on User {token, ...user}'
                }
            }
        }));

    it('client should be a function', () => {
        expect(typeof client).toBe('function');
    });

    describe('.fragment()', () => {
        it('registers a new fragment', () => {
            client.fragment({
                auth: {
                    error: 'on Error {messages}'
                }
            });

            expect(client.fragment('auth.error')).toBe(
                'fragment auth_error on Error {messages}'
            );
        });
    });

    describe('.getOptions()', () => {
        it('configures the method as requested', () => {
            expect(client.getOptions().method).toBe('POST');
        });
    });

    describe('.fragments()', () => {
        it('returns an object with the defined fragments as properties', () => {
            expect(client.fragments()).toStrictEqual(
                expect.objectContaining({
                    user: '\nfragment user on User {name}',
                    auth_user: '\nfragment auth_user on User {token, ...user}',
                })
            );
        });

        it('returns new registered fragments as well', () => {
            client.fragment({
                auth: {
                    error: 'on Error {messages}'
                }
            });

            expect(client.fragments()).toStrictEqual(
                expect.objectContaining({
                    auth_error: '\nfragment auth_error on Error {messages}',
                })
            );
        });
    });

    describe('@autodeclare queries', () => {
        let queryIn = `query (@autodeclare) {
	user(name: $name, bool: $bool, int: $int, id: $id) {
		...auth.user
		...auth.error
	}
	x {
		... auth.user
	}
}`;

        it('mixes in the requested fragments and sets the data types', () => {
            client.fragment({
                auth: {
                    error: 'on Error {messages}'
                }
            });

            const expectedQuery = `query ($name: String!, $bool: Boolean!, $int: Int!, $float: Float!, $id: ID!, $user_id: Int!, $postID: ID!, $custom_id: CustomType!, $customId: ID!, $target: [ID!]!) {
	user(name: $name, bool: $bool, int: $int, id: $id) {
		... auth_user
		... auth_error
	}
	x {
		... auth_user
	}
}

fragment user on User {name}

fragment auth_user on User {token, ...user}

fragment auth_error on Error {messages}`;

            const query = client.buildQuery(queryIn, {
                name: 'fatih',
                bool: true,
                int: 2,
                float: 2.3,
                id: 1,
                'user_id!': 2,
                'postID': '45af67cd',
                'custom_id!CustomType': '1',
                'customId': '1',
                'target![ID!]': ['Q29uZ3JhdHVsYXRpb25z']
            });

            expect(query).toBe(expectedQuery);
        });
    });

    describe('.query()', () => {
        it('returns a function', () => {
            let query = client.query(`($email: String!, $password: String!) {
                auth(email: $email, password: $password) {
                    ... on User {
                        token
                    }
                }
            }`);
            expect(typeof query).toBe('function');
        });
    });

    describe('.getUrl()/setUrl()', () => {
        it('updates the url', () => {
            client.headers({'User-Agent': 'Awesome-Octocat-App'});

            client.query(`
                repository(owner:"f", name:"graphql.js") {
                    issues(last:20, states:CLOSED) {
                        edges {
                            node {
                                title
                                url
                            }
                        }
                    }
                }`);

            // check old URL
            expect(client.getUrl()).toBeNull();
            // set new URL
            const newUrl = 'https://api.github.com/graphql'
            client.setUrl(newUrl)
            expect(client.getUrl()).toBe(newUrl);
        })
    });

    describe('query testing', () => {
        set('fetchPost', () => client.query(`{
  post(id: $id) {
    id
    title
    text
  }
}`));
        set('fetchComments', () => client.query(`{
  commentsOfPost: comments(postId: $postId) {
    comment
    owner {
      name
    }
  }
}`));

        set('url', () => endpointUrl);

        describe('when method is GET', () => {
            set('method', () => 'get');

            it('returns the payload from the server', async () => {
                const response = await fetchPost({id: 123});

                expect(response).toEqual({post:{id: 123, title: 'hi', text: 'hello'}});
            })

            it('makes the request passing the parameters as query arguments', async () => {
                await fetchPost({id: 123});

                const request = requests[0];

                expect(request.method).toEqual('GET');
                expect(request.url).toMatch(url);
                expect(request.url).toMatch(/\?query=.+&variables=/);
                expect(request.variables).toEqual({id: 123});
                expect(request.query).toMatch('post(id: $id)');
            });
        });

        describe('when executing the queries normally (via POST)', () => {
            it('sends the correctly formatted request to the server', async () => {
                await fetchPost({id: 123});

                const request = requests[0];

                expect(request.query).toEqual("query {\n  post(id: $id) {\n    id\n    title\n    text\n  }\n} ");
                expect(request.variables).toEqual({id: 123})
            });

            it('returns the payload from the server', async () => {
                const response = await fetchPost({id: 123});

                expect(response).toEqual({post: {id: 123, title:'hi', text:'hello'}});
            });
        });

        describe('.merge()/.commit()', () => {
            it('does not send the request when using merge', async () => {
                fetchPost.merge('buildPage', {id: 123});

                expect(requests).toHaveLength(0);
            });

            it('sends the request when commit is called', async () => {
                fetchPost.merge('buildPage', {id: 123});
                expect(requests).toHaveLength(0);

                await client.commit('buildPage');
                expect(requests).toHaveLength(1);
            });

            it('sends the correctly formatted request to the server', async () => {
                fetchPost.merge('buildPage', {id: 123});
                mockRandom(0.1234);
                await client.commit('buildPage');
                resetMockRandom();

                const request = requests[0];

                expect(request.query).toEqual("query ($merge1234__id: ID!) {\nmerge1234_post:post(id: $merge1234__id) {\n    id\n    title\n    text\n  }\n }");
                expect(request.variables).toEqual({merge1234__id: 123});
            });

            it('provides the correct response', async () => {
                const response = fetchPost.merge('buildPage', {id: 123});
                mockRandom(0.1234);
                await client.commit('buildPage');
                resetMockRandom();

                expect(await response).toEqual({post: {id: 123, title: 'hi', text: 'hello'}});
            });

            describe('when merging multiple queries', () => {
                it('responds with the correct response for each request', async () => {
                    let postId = 123;
                    const response1 = fetchPost.merge('buildPage', {id: postId});
                    const response2 = fetchComments.merge('buildPage', {postId: postId});
                    mockRandom([0.1234, 0.4321]);
                    let response = await client.commit('buildPage');
                    resetMockRandom();

                    expect(await response1).toEqual({post: {id: postId, title: 'hi', text: 'hello'}});
                    expect(await response2).toEqual({commentsOfPost: [{ comment: 'hi', owner: { name: 'bob' } }]});
                    expect(response).toEqual({
                        post: [{id: postId, title: 'hi', text: 'hello'}],
                        commentsOfPost: [[{ comment: 'hi', owner: { name: 'bob' } }]],
                    })
                });

                it('sends the correctly formatted merged request to the server', async () => {
                    let postId = 123;
                    fetchPost.merge('buildPage', {id: postId});
                    fetchComments.merge('buildPage', {postId: postId});
                    mockRandom([0.1234, 0.4321]);
                    await client.commit('buildPage');
                    resetMockRandom();

                    const request = requests[0];

                    expect(request.query).toEqual("query ($merge1234__id: ID!, $merge4321__postId: ID!) {\n"
                            + "merge1234_post:post(id: $merge1234__id) {\n    id\n    title\n    text\n  }\n"
                            + "merge4321_commentsOfPost: comments(postId: $merge4321__postId) {\n    comment\n    owner {\n      name\n    }\n  }\n"
                            +" }");
                    expect(request.variables).toEqual({
                        "merge1234__id": 123,
                        "merge4321__postId": 123,
                    });
                });
            });
        });
    });
});
