// src/tests/services/shopify-api.test.ts
import { ShopifyAPI } from "../../services/shopify-api";
import { createAdminApiClient } from "@shopify/admin-api-client";

// We need to mock external dependencies
const mockRequest = jest.fn();
jest.mock("@shopify/admin-api-client", () => ({
  createAdminApiClient: jest.fn().mockReturnValue({
    request: mockRequest,
  }),
}));

describe("ShopifyAPI", () => {
  let shopifyAPI: ShopifyAPI;

  beforeEach(() => {
    // Reset mock before each test
    mockRequest.mockReset();

    // Create a new instance for each test
    shopifyAPI = new ShopifyAPI({
      shopName: "test-store.myshopify.com",
      accessToken: "test-token",
    });
  });

  describe("getProductIds with incremental sync", () => {
    test("should apply updatedAtMin filter for incremental sync", async () => {
      // Arrange
      const lastSyncTime = new Date("2024-01-01T00:00:00Z").toISOString();

      // Mock the API response
      mockRequest.mockResolvedValueOnce({
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

      // Act
      await shopifyAPI.getProductIds({ updatedAtMin: lastSyncTime });

      // Assert - Check that the query includes our filter
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Extract the variables passed to the request
      const requestArgs = mockRequest.mock.calls[0][1];
      const { variables } = requestArgs;

      // Check if the query string contains our updated_at filter
      expect(variables.query).toContain(`updated_at:>=${lastSyncTime}`);
    });

    test("should handle pagination for incremental sync", async () => {
      // Arrange - Setup mock to return two pages of results
      mockRequest
        // First page response
        .mockResolvedValueOnce({
          data: {
            products: {
              pageInfo: {
                hasNextPage: true,
                endCursor: "cursor1",
              },
              edges: [{ node: { id: "gid://shopify/Product/123" } }],
            },
          },
        })
        // Second page response
        .mockResolvedValueOnce({
          data: {
            products: {
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
              edges: [{ node: { id: "gid://shopify/Product/456" } }],
            },
          },
        });

      // Act
      const result = await shopifyAPI.getProductIds(
        { updatedAtMin: "2024-01-01T00:00:00Z" },
        { limit: "all" }
      );

      // Assert
      expect(result).toEqual(["123", "456"]);
      expect(mockRequest).toHaveBeenCalledTimes(2);

      // Check if the second call uses the cursor from the first response
      const secondCallArgs = mockRequest.mock.calls[1][1];
      expect(secondCallArgs.variables.after).toBe("cursor1");
    });

    test("should extract product IDs correctly from Shopify GraphQL response", async () => {
      // Arrange
      mockRequest.mockResolvedValueOnce({
        data: {
          products: {
            pageInfo: {
              hasNextPage: false,
              endCursor: null,
            },
            edges: [
              { node: { id: "gid://shopify/Product/123" } },
              { node: { id: "gid://shopify/Product/456" } },
            ],
          },
        },
      });

      // Act
      const result = await shopifyAPI.getProductIds();

      // Assert - Check that we correctly extract the numeric IDs from the GraphQL format
      expect(result).toEqual(["123", "456"]);
    });
  });

  describe("getProductIdsGenerator for incremental sync", () => {
    test("should yield product IDs in batches with incremental filter", async () => {
      // Arrange
      const lastSyncTime = "2024-01-01T00:00:00Z";

      // Mock responses for two pages
      mockRequest
        .mockResolvedValueOnce({
          data: {
            products: {
              pageInfo: {
                hasNextPage: true,
                endCursor: "cursor1",
              },
              edges: [
                {
                  node: {
                    id: "gid://shopify/Product/123",
                    updatedAt: "2024-01-02T00:00:00Z",
                  },
                },
              ],
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            products: {
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
              edges: [
                {
                  node: {
                    id: "gid://shopify/Product/456",
                    updatedAt: "2024-01-03T00:00:00Z",
                  },
                },
              ],
            },
          },
        });

      // Act
      const generator = shopifyAPI.getProductIdsGenerator({
        updatedAtMin: lastSyncTime,
      });

      // Collect results from the generator
      const results = [];
      for await (const batch of generator) {
        results.push(batch);
      }

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(["123"]);
      expect(results[1]).toEqual(["456"]);

      // Verify the query includes our filter
      const firstCallArgs = mockRequest.mock.calls[0][1];
      expect(firstCallArgs.variables.query).toContain(
        `updated_at:>=${lastSyncTime}`
      );

      // Verify pagination is handled correctly
      expect(mockRequest).toHaveBeenCalledTimes(2);
      const secondCallArgs = mockRequest.mock.calls[1][1];
      expect(secondCallArgs.variables.after).toBe("cursor1");
    });
  });
});
