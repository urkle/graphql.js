import { setupServer } from 'msw/node';
import { graphql as mswGraphql } from 'msw';

export const endpointUrl = 'http://localhost:3000/graphql';

export const graphqlEndpoint = mswGraphql.link(endpointUrl);

export const mockServer = setupServer();
