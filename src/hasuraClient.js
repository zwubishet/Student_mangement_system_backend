import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client/core';
import fetch from 'cross-fetch';

const HASURA_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT || 'http://localhost:8082/v1/graphql';
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'supersecret';

const client = new ApolloClient({
  link: new HttpLink({ uri: HASURA_ENDPOINT, fetch, headers: { 'x-hasura-admin-secret': HASURA_ADMIN_SECRET } }),
  cache: new InMemoryCache(),
});

export default client;
