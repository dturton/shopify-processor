/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as AdminTypes from './admin.types';

export type GetShopInfoQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type GetShopInfoQuery = { shop: Pick<AdminTypes.Shop, 'name'> };

interface GeneratedQueryTypes {
  "#graphql\n      query GetShopInfo {\n        shop {\n          name\n        }\n      }\n    ": {return: GetShopInfoQuery, variables: GetShopInfoQueryVariables},
}

interface GeneratedMutationTypes {
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
