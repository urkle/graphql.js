import { set } from 'vitest-plugin-set';
import {expect, describe, it, beforeEach} from 'vitest';
import {mockServer, graphqlEndpoint, endpointUrl} from 'tests/mock_server';
import {mockRandom, resetMockRandom} from 'jest-mock-random';

import graphql from '../src/graphql.js';

let requests= [];
let payloads = {
    posts: ({id}) => ({id, title: 'hi', text: 'hello'}),
    createPost: ({input}) => ({id: 1, ...input}),
    comments: (_) => ([{ comment: 'hi', owner: { name: 'bob' } }]),
    simpleQuery: (_) => ({version: 1}),
    simpleMutate: (_) => ({version: 1}),
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
                    response.merge1234_post = payloads.posts({id: request.variables.merge1234__id});
                }
                if (request.query.match(/merge4321_commentsOfPost/)) {
                    response.merge4321_commentsOfPost = payloads.comments({postId: request.variables.merge4321__postId});
                }
            } else if (request.query.match(/\$id/)) {
                response.post = payloads.posts(request.variables);
            } else if (request.query.match(/\$postId/)) {
                response.commentsOfPost = payloads.comments(request.variables);
            } else if (request.query.match(/createPost/)) {
                response.createPost = payloads.createPost(request.variables);
            } else if (request.query.match(/simpleQuery/)) {
                response.simpleQuery = payloads.simpleQuery(request.variables);
            } else if (request.query.match(/simpleMutate/)) {
                response.simpleMutate = payloads.simpleMutate(request.variables);
            }
            return res(ctx.data(response));
        }),
    );
});

/* global subject, client, method, url, fetchPost, fetchComments */
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

    describe('new GraphQLClient', () => {
       expect(() => new graphql(endpointUrl)).toThrowError(/You cannot create/);
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

        it('throws error when fragment not found', () => {
            expect(() => client.fragment('myFragment')).toThrowError('Fragment myFragment not found!')
        })
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

    describe('.ql()', () => {
       it('builds a query', () => {
           const query = client.ql('query {... auth_user}');

           expect(query).toEqual("query {... auth_user}\n\n"
                +"fragment user on User {name}\n\n"
                +"fragment auth_user on User {token, ...user}");
       });
    });

    describe('.ql es6 template', () => {
        it('builds a query', () => {
            const query = client.ql`query {... auth.user}`;

            expect(query).toEqual("query {... auth_user}\n\n"
                +"fragment user on User {name}\n\n"
                +"fragment auth_user on User {token, ...user}");
        });
    });

    describe('when no URL is set', () => {
       set('subject', () => client.query`simpleQuery { version}`);

       it('returns an error', async () => {
           await expect(subject).rejects.toThrow('No URL specified');
       });
    });

    describe('direct run', () => {
        set('url', () => endpointUrl);

        describe('graph(...)()', () => {
            set('subject', () => client(`query { post(id: $id) { id title text} }`)({id: 123}));

            it('returns the payload from the server', async () => {
                const response = await subject;

                expect(response).toEqual({post:{id: 123, title: 'hi', text: 'hello'}});
            })

            it('makes the request passing the parameters as query arguments', async () => {
                await subject;

                const request = requests[0];

                expect(request.variables).toEqual({id: 123});
                expect(request.query).toMatch('post(id: $id)');
            });
        });

        describe('graph.query(...)()', () => {
            set('subject', () => client.query(`($id: ID!) { post(id: $id) { id title text}}`)({id: 123}));

            it('returns the payload from the server', async () => {
                const response = await subject;

                expect(response).toEqual({post:{id: 123, title: 'hi', text: 'hello'}});
            })

            it('makes the request passing the parameters as query arguments', async () => {
                await subject;

                const request = requests[0];

                expect(request.variables).toEqual({id: 123});
                expect(request.query).toMatch('post(id: $id)');
            });
        });

        describe('graph.mutate(...)()', () => {
            set('subject', () => client.mutate(`($input: Input!) { createPost(input: $input) { id title text} }`)({input: {title: 'yo'}}));

            it('returns the payload from the server', async () => {
                const response = await subject;

                expect(response).toEqual({createPost: {id: 1, title: 'yo'}});
            })

            it('makes the request passing the parameters as query arguments', async () => {
                await subject;

                const request = requests[0];

                expect(request.variables).toEqual({input: {title: 'yo'}});
                expect(request.query).toMatch('createPost(input: $input)');
            });
        });
    });

    describe('direct run with run()', () => {
        set('url', () => endpointUrl);

        describe('graph.run(...)', () => {
            set('subject', () => client.run(`query { simpleQuery { version} }`));

            it('returns the payload from the server', async () => {
                const response = await subject;

                expect(response).toEqual({simpleQuery: {version: 1}});
            })

            it('makes the request passing the parameters as query arguments', async () => {
                await subject;

                const request = requests[0];

                expect(request.variables).toEqual({});
                expect(request.query).toMatch('simpleQuery');
            });
        });

        describe('graph.query.run(...)', () => {
            set('subject', () => client.query.run(`simpleQuery { version }`));

            it('returns the payload from the server', async () => {
                const response = await subject;

                expect(response).toEqual({simpleQuery: {version: 1}});
            })

            it('makes the request passing the parameters as query arguments', async () => {
                await subject;

                const request = requests[0];

                expect(request.variables).toEqual( {});
                expect(request.query).toMatch('simpleQuery');
            });
        });

        describe('graph.mutate.run(...)', () => {
            set('subject', () => client.mutate.run(`simpleMutate { version }`));

            it('returns the payload from the server', async () => {
                const response = await subject;

                expect(response).toEqual({simpleMutate: { version: 1}});
            })

            it('makes the request passing the parameters as query arguments', async () => {
                await subject;

                const request = requests[0];

                expect(request.variables).toEqual({});
                expect(request.query).toMatch('simpleMutate');
            });
        });
    });

    describe('direct run with es6 template', () => {
        set('url', () => endpointUrl);

        describe('graph`...`', () => {
            set('subject', () => client`query { simpleQuery { version} }`);

            it('returns the payload from the server', async () => {
                const response = await subject;

                expect(response).toEqual({simpleQuery: {version: 1}});
            })

            it('makes the request passing the parameters as query arguments', async () => {
                await subject;

                const request = requests[0];

                expect(request.variables).toEqual({});
                expect(request.query).toMatch('simpleQuery');
            });
        });

        describe('graph.query`...`', () => {
            set('subject', () => client.query`simpleQuery { version }`);

            it('returns the payload from the server', async () => {
                const response = await subject;

                expect(response).toEqual({simpleQuery: {version: 1}});
            })

            it('makes the request passing the parameters as query arguments', async () => {
                await subject;

                const request = requests[0];

                expect(request.variables).toEqual( {});
                expect(request.query).toMatch('simpleQuery');
            });
        });

        describe('graph.mutate`...`', () => {
            set('subject', () => client.mutate`simpleMutate { version }`);

            it('returns the payload from the server', async () => {
                const response = await subject;

                expect(response).toEqual({simpleMutate: { version: 1}});
            })

            it('makes the request passing the parameters as query arguments', async () => {
                await subject;

                const request = requests[0];

                expect(request.variables).toEqual({});
                expect(request.query).toMatch('simpleMutate');
            });
        });
    });

    describe('prepared queries', () => {
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

    describe('.merge()/.commit()', () => {
        set('url', () => endpointUrl);
        set('fetchPost', () => client.query(`($id: ID) {
  post(id: $id) {
    id
    title
    text
  }
}`));

        it('errors when commit called with no merge calls', () => {
            expect(() => client.commit('buildPage')).toThrowError('You cannot commit the merge');
        });

        it('errors when no variables passed', async () => {
            // This really is incorrect behavior here. As if the variable is optional then it shouldn't matter
            fetchPost.merge('buildPage');

            expect(() => client.commit('buildPage')).toThrowError('Unused variable on merge');
        });
    });
});
