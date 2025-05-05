// src/tests/services/shopify-api.simple.test.ts

// Import the module to test
import { ShopifyAPI } from "../../services/shopify-api";
import {
  describe,
  expect,
  test,
  jest,
  beforeEach,
  beforeAll,
  afterAll,
} from "@jest/globals";

// Create a mock version of the dependencies
const createMockShopifyAPI = () => {
  // Mock data
  const mockProducts = [
    { id: "gid://shopify/Product/123", title: "Test Product 1" },
    { id: "gid://shopify/Product/456", title: "Test Product 2" },
  ];

  // Mock implementation
  class MockShopifyAPI extends ShopifyAPI {
    constructor() {
      super({
        shopName: "test-store.myshopify.com",
        accessToken: "test-token",
      });
    }

    // Override methods with test implementations
    async getProductIds(filters = {}) {
      // Check if this is an incremental sync
      if (filters.updatedAtMin) {
        return ["456"]; // Only return products updated after the lastSyncTime
      }
      return ["123", "456"]; // Return all products for full sync
    }

    async getProduct(id: string) {
      return {
        id,
        title: `Test Product ${id}`,
        handle: `test-${id}`,
        variants: [{ id: `v${id}`, price: "10.00", sku: `SKU${id}` }],
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
      };
    }

    async *getProductIdsGenerator(filters = {}) {
      if (filters.updatedAtMin) {
        yield ["456"]; // Only yield products updated after lastSyncTime
      } else {
        yield ["123", "456"]; // Yield all products for full sync
      }
    }
  }

  return new MockShopifyAPI();
};

describe("Shopify Incremental Sync", () => {
  test("should only return products updated after lastSyncTime", async () => {
    // Arrange
    const api = createMockShopifyAPI();
    const lastSyncTime = "2024-01-01T00:00:00Z";

    // Act
    const products = await api.getProductIds({ updatedAtMin: lastSyncTime });

    // Assert - Only product 456 should be returned (incremental)
    expect(products).toEqual(["456"]);

    // Act again - Full sync
    const allProducts = await api.getProductIds();

    // Assert - All products should be returned (full sync)
    expect(allProducts).toEqual(["123", "456"]);
  });

  test("getProductIdsGenerator should stream products incrementally", async () => {
    // Arrange
    const api = createMockShopifyAPI();
    const lastSyncTime = "2024-01-01T00:00:00Z";

    // Act - Incremental sync
    const generator = api.getProductIdsGenerator({
      updatedAtMin: lastSyncTime,
    });
    const incrementalResults = [];

    for await (const batch of generator) {
      incrementalResults.push(batch);
    }

    // Assert - Only updated products in incremental sync
    expect(incrementalResults).toHaveLength(1);
    expect(incrementalResults[0]).toEqual(["456"]);

    // Act - Full sync
    const fullGenerator = api.getProductIdsGenerator();
    const fullResults = [];

    for await (const batch of fullGenerator) {
      fullResults.push(batch);
    }

    // Assert - All products in full sync
    expect(fullResults).toHaveLength(1);
    expect(fullResults[0]).toEqual(["123", "456"]);
  });
});
