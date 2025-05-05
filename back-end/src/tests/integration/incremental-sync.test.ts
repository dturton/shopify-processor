// src/tests/integration/incremental-sync.test.ts
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { IntegrationJobProcessor } from "../../queues/IntegrationJobProcessor";
import { JobState } from "../../models/JobState";
import { ProductModel } from "../../models/product";
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

// Mock external dependencies
jest.mock("../../services/shopify-api");
jest.mock("bullmq");

describe("Incremental Sync Integration", () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    // Setup in-memory MongoDB for testing
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    // Clean up
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear the collections before each test
    await JobState.deleteMany({});
    await ProductModel.deleteMany({});

    // Mock ShopifyAPI implementation
    const mockShopifyApi = {
      getProductIdsGenerator: jest.fn().mockImplementation(async function* () {
        // Only return products that have been updated since the lastSyncTime
        if (this.lastSyncTimeFilter) {
          yield ["2", "3"]; // These were updated after Jan 2
        } else {
          C;
          yield ["1", "2", "3"];
        }
      }),
      getProduct: jest.fn().mockImplementation((id) => {
        const createdDate = "2024-01-01T12:00:00Z";
        // Product 1 updated on Jan 1, Products 2 & 3 updated on Jan 3
        const updatedDate =
          id === "1" ? "2024-01-01T12:00:00Z" : "2024-01-03T12:00:00Z";

        return {
          id,
          title: `Product ${id}`,
          description: "Test description",
          handle: `product-${id}`,
          product_type: "Test",
          vendor: "Test Vendor",
          tags: ["test"],
          variants: [
            {
              id: `v${id}`,
              price: "10.00",
              sku: `SKU${id}`,
            },
          ],
          created_at: createdDate,
          updated_at: updatedDate,
        };
      }),
    };

    // Set the mock implementation
    (ShopifyAPI as jest.Mock).mockImplementation((credentials) => {
      // Store filter for testing
      const api = { ...mockShopifyApi };
      if (credentials.filters?.updatedAtMin) {
        api.lastSyncTimeFilter = credentials.filters.updatedAtMin;
      }
      return api;
    });
  });

  it("should only process products updated since lastSyncTime", async () => {
    // Arrange - Create an initial job and store some products
    const initialJob = await JobState.create({
      jobId: "initial-job",
      sourceType: "shopify",
      destinationType: "mongodb",
      status: "COMPLETED",
      totalRecords: 3,
      recordsSucceeded: 3,
      recordsFailed: 0,
      progress: 100,
      lastSyncTime: new Date("2024-01-02T00:00:00Z"), // Last sync was on Jan 2
    });

    // Insert initial products
    await ProductModel.insertMany([
      {
        storeId: "test-store",
        productId: "1",
        title: "Product 1",
        handle: "product-1",
        variants: [{ variantId: "v1", price: "10.00", sku: "SKU1" }],
        shopifyCreatedAt: new Date("2024-01-01"),
        shopifyUpdatedAt: new Date("2024-01-01"),
        _sync_metadata: {
          deleted_at: null,
          last_action: "ADDED",
          first_seen_at: new Date("2024-01-01"),
          cursor: "initial",
          last_modified_at: new Date("2024-01-01"),
        },
      },
      {
        storeId: "test-store",
        productId: "2",
        title: "Product 2 - Old Version",
        handle: "product-2",
        variants: [{ variantId: "v2", price: "10.00", sku: "SKU2" }],
        shopifyCreatedAt: new Date("2024-01-01"),
        shopifyUpdatedAt: new Date("2024-01-01"),
        _sync_metadata: {
          deleted_at: null,
          last_action: "ADDED",
          first_seen_at: new Date("2024-01-01"),
          cursor: "initial",
          last_modified_at: new Date("2024-01-01"),
        },
      },
    ]);

    // Mock the job processor methods to avoid actual processing
    const processMock = jest.fn().mockResolvedValue(true);
    IntegrationJobProcessor.createIncrementalJob = jest.fn().mockResolvedValue({
      job: { id: "incremental-job" },
      isIncremental: true,
      previousSyncTime: initialJob.lastSyncTime,
    });

    // Act - Trigger an incremental sync that will use the lastSyncTime
    await IntegrationJobProcessor.createIncrementalJob("shopify", "mongodb");

    // Simulate job processing with the processor
    // In a real test, you'd want to use a controlled worker here
    const jobWorker = {
      initialize: jest.fn().mockResolvedValue(true),
      process: processMock,
    };

    // Verify that only updated products are processed
    // Here, you'd need to verify the ShopifyAPI calls and database updates

    // Query the products after sync to verify only specific ones were updated
    const product1 = await ProductModel.findOne({ productId: "1" });
    const product2 = await ProductModel.findOne({ productId: "2" });
    const product3 = await ProductModel.findOne({ productId: "3" });

    // Product 1 shouldn't be updated since it wasn't modified after lastSyncTime
    expect(product1.title).toBe("Product 1");

    // Products 2 & 3 should be updated since they were modified after lastSyncTime
    expect(product2.title).toBe("Product 2 - New Version");
    expect(product3).toBeDefined();
  });
});
