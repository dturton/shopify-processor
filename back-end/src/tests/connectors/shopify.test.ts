// src/tests/connectors/shopify.test.ts
import fetchData from "../../connectors/sources/shopify";
import { SyncContext } from "../../types";
import { ShopifyAPI } from "../../services/shopify-api";
import { ProductModel } from "../../models/product";
import {
  describe,
  expect,
  test,
  jest,
  beforeEach,
  beforeAll,
  afterAll,
} from "@jest/globals";

// Mock the imported modules
jest.mock("../../services/shopify-api");
jest.mock("../../models/product");
jest.mock("../../utils/logger");

describe("Shopify Connector", () => {
  // Mock for syncContext
  const createMockSyncContext = (config = {}): SyncContext => ({
    recordTotalCount: jest.fn(),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
    updateProgress: jest.fn(),
    collectRecords: jest.fn(),
    getConfig: jest.fn().mockReturnValue({
      shopName: "test-store",
      accessToken: "test-token",
      ...config,
    }),
    log: jest.fn(),
    getMetrics: jest.fn().mockReturnValue({
      totalRecords: 0,
      recordsSucceeded: 0,
      recordsFailed: 0,
      progress: 0,
      collectedRecords: {},
    }),
    setMetadata: jest.fn(),
    getMetadata: jest.fn(),
  });

  // Mock ShopifyAPI methods
  let mockProductIdsGenerator: jest.Mock;
  let mockGetProduct: jest.Mock;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup specific mocks
    mockProductIdsGenerator = jest.fn();
    mockGetProduct = jest.fn();

    // Configure ShopifyAPI mock
    (ShopifyAPI as jest.Mock).mockImplementation(() => ({
      getProductIdsGenerator: mockProductIdsGenerator,
      getProduct: mockGetProduct,
    }));

    // Mock ProductModel.findOne and updateOne
    (ProductModel.findOne as jest.Mock) = jest.fn().mockResolvedValue(null);
    (ProductModel.updateOne as jest.Mock) = jest.fn().mockResolvedValue({
      upsertedCount: 1,
    });
  });

  test("should use lastSyncTime for incremental sync", async () => {
    // Arrange
    const lastSyncTime = new Date("2024-01-01T00:00:00Z").toISOString();
    const syncContext = createMockSyncContext({ lastSyncTime });

    // Setup the generator to yield product IDs
    mockProductIdsGenerator.mockImplementation(async function* () {
      yield ["123", "456"];
    });

    // Setup product data returned
    mockGetProduct.mockImplementation((id) => ({
      id,
      title: `Test Product ${id}`,
      description: "Test description",
      handle: `test-${id}`,
      product_type: "Test",
      vendor: "Test Vendor",
      tags: ["test"],
      variants: [
        {
          id: `v${id}`,
          price: "10.00",
          sku: `SKU${id}`,
          compare_at_price: null,
          inventory_quantity: 10,
          inventory_item_id: `inv${id}`,
        },
      ],
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    }));

    // Act
    await fetchData(syncContext);

    // Assert
    // Check that we're using the lastSyncTime in our filters
    expect(mockProductIdsGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedAtMin: lastSyncTime,
      }),
      expect.anything()
    );

    // Check that we're logging that this is an incremental sync
    expect(syncContext.log).toHaveBeenCalledWith(
      "info",
      expect.stringContaining("incremental sync"),
      expect.anything()
    );
  });

  test("should perform full sync when no lastSyncTime is provided", async () => {
    // Arrange
    const syncContext = createMockSyncContext({ lastSyncTime: null });

    // Setup the generator to yield product IDs
    mockProductIdsGenerator.mockImplementation(async function* () {
      yield ["123", "456"];
    });

    // Setup product data returned
    mockGetProduct.mockImplementation((id) => ({
      id,
      title: `Test Product ${id}`,
      handle: `test-${id}`,
      variants: [{ id: `v${id}`, price: "10.00", sku: `SKU${id}` }],
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    }));

    // Mock for handling deleted products in full sync
    (ProductModel.updateMany as jest.Mock) = jest.fn().mockResolvedValue({
      modifiedCount: 1,
    });

    // Act
    await fetchData(syncContext);

    // Assert
    // Check that we're not using updatedAtMin filter for full sync
    expect(mockProductIdsGenerator).toHaveBeenCalledWith(
      expect.not.objectContaining({
        updatedAtMin: expect.anything(),
      }),
      expect.anything()
    );

    // Check that we're marking deleted products for full sync
    expect(ProductModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "test-store",
        productId: { $nin: expect.arrayContaining(["123", "456"]) },
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          "_sync_metadata.deleted_at": expect.any(Date),
          "_sync_metadata.last_action": "DELETED",
        }),
      })
    );
  });

  test("should handle and track errors properly during sync", async () => {
    // Arrange
    const syncContext = createMockSyncContext({ lastSyncTime: null });

    // Setup the generator to yield product IDs
    mockProductIdsGenerator.mockImplementation(async function* () {
      yield ["123", "456"];
    });

    // Make one product fetch succeed and one fail
    mockGetProduct
      .mockResolvedValueOnce({
        id: "123",
        title: "Test Product 123",
        handle: "test-123",
        variants: [{ id: "v123", price: "10.00", sku: "SKU123" }],
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
      })
      .mockRejectedValueOnce(new Error("API Error for product 456"));

    // Act
    await fetchData(syncContext);

    // Assert
    // Check that we're logging the error
    expect(syncContext.log).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("Error processing batch"),
      expect.anything()
    );

    // Check that we're tracking failures
    expect(syncContext.recordFailure).toHaveBeenCalled();
  });
});
