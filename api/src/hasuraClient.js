import pkg from '@apollo/client';
const { ApolloClient, HttpLink, InMemoryCache } = pkg;

import fetch from 'cross-fetch';

const HASURA_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT || 'http://localhost:8082/v1/graphql';
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'supersecret';

const client = new ApolloClient({
  link: new HttpLink({
    uri: HASURA_ENDPOINT,
    fetch,
    headers: { 'x-hasura-admin-secret': HASURA_ADMIN_SECRET }
  }),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'no-cache' },
    query: { fetchPolicy: 'no-cache' },
  },
});

export default client;