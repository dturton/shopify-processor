// src/tests/services/shopify-api.basic.test.ts

// Import the module to test
import { ShopifyAPI } from "../../services/shopify-api";
import { createAdminApiClient } from "@shopify/admin-api-client";

// Manual mock setup
const mockRequestFn = async () => ({
  data: {
    products: {
      pageInfo: {
        hasNextPage: false,
        endCursor: null,
      },
      edges: [{ node: { id: "gid://shopify/Product/123" } }],
    },
  },
});
import {
  describe,
  expect,
  test,
  jest,
  beforeEach,
  beforeAll,
  afterAll,
} from "@jest/globals";

// Override the imported module with our mock
(createAdminApiClient as any) = () => ({
  request: mockRequestFn,
});

describe("ShopifyAPI", () => {
  test("should fetch products", async () => {
    // Create instance of the class
    const api = new ShopifyAPI({
      shopName: "test-store.myshopify.com",
      accessToken: "test-token",
    });

    // Call the method
    const products = await api.getProductIdsGenerator();

    // Assert the result
    expect(products).toEqual(["123"]);
  });
});
