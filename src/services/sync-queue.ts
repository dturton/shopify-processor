// src/services/sync-queue.ts
import { Queue, Worker, QueueEvents } from "bullmq";
import { ShopifyAPI } from "./shopify-api";
import { SyncStateModel } from "../models/sync-state";
import { ProductModel } from "../models/product";
import { ProductFilters } from "../types";
import logger from "../utils/logger";
import config from "../config";

// Redis connection options
const redisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
};

// Define job types
interface ProductSyncJob {
  storeId: string;
  shopCredentials: {
    shopName: string;
    accessToken: string;
  };
  filters: ProductFilters;
  limit: number | "all";
  batchSize: number;
  forceFullSync: boolean;
  syncStateId: string;
}

interface ProcessProductBatchJob {
  storeId: string;
  shopCredentials: {
    shopName: string;
    accessToken: string;
  };
  productIds: string[];
  syncStateId: string;
  forceFullSync: boolean;
}

// Create queues
const syncQueue = new Queue<ProductSyncJob>("product-sync", {
  connection: redisOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: false,
    removeOnFail: false,
  },
});

const productBatchQueue = new Queue<ProcessProductBatchJob>(
  "process-product-batch",
  {
    connection: redisOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: false,
      removeOnFail: false,
    },
  }
);

// Create queue events
const syncQueueEvents = new QueueEvents("product-sync", {
  connection: redisOptions,
});
const batchQueueEvents = new QueueEvents("process-product-batch", {
  connection: redisOptions,
});

// Initialize workers
export function initSyncWorkers() {
  // Main sync worker - Fetches product IDs and creates batch jobs
  const syncWorker = new Worker<ProductSyncJob>(
    "product-sync",
    async (job) => {
      const {
        storeId,
        shopCredentials,
        filters,
        limit,
        batchSize,
        forceFullSync,
        syncStateId,
      } = job.data;

      try {
        logger.info(`Starting product sync for store ${storeId}`, {
          jobId: job.id,
        });

        // Find the sync state
        const syncState = await SyncStateModel.findById(syncStateId);
        if (!syncState) {
          throw new Error(`Sync state ${syncStateId} not found`);
        }

        // Update sync state to show we're processing
        syncState.isInProgress = true;
        await syncState.save();

        // Initialize Shopify API
        const shopify = new ShopifyAPI(shopCredentials);

        // Add filters for incremental sync if not doing a force full sync
        let incrementalFilters = { ...filters };
        if (!forceFullSync && syncState.lastSyncedAt) {
          // Filter products updated since last sync
          incrementalFilters.updatedAtMin =
            syncState.lastSyncedAt.toISOString();
          logger.info(
            `Performing incremental sync since ${syncState.lastSyncedAt.toISOString()}`
          );

          // Update job progress
          await job.updateProgress(10);
        } else {
          logger.info("Performing full sync");

          // Update job progress
          await job.updateProgress(10);
        }

        // Get product IDs
        const productIds = await shopify.getProductIds(incrementalFilters, {
          limit,
          batchSize,
        });

        logger.info(
          `Retrieved ${productIds.length} product IDs, creating batch jobs`
        );

        // Update sync state with total products to process
        syncState.lastSyncStats.totalProductsToProcess = productIds.length;
        await syncState.save();

        // Update job progress
        await job.updateProgress(20);

        // If doing a full sync, we need to track existing products for deletion detection
        let existingProductIds: string[] = [];
        if (forceFullSync) {
          // Get all product IDs from our database for this store
          existingProductIds = await ProductModel.distinct("productId", {
            storeId,
          });

          // Save this list for later comparison
          syncState.lastSyncStats.existingProductIds = existingProductIds;
          await syncState.save();
        }

        // Create batch jobs for processing product details
        const batchCount = Math.ceil(productIds.length / batchSize);
        let batchJobs = [];

        for (let i = 0; i < productIds.length; i += batchSize) {
          const batchIds = productIds.slice(i, i + batchSize);

          // Create batch job
          const batchJob = await productBatchQueue.add(
            "process-batch",
            {
              storeId,
              shopCredentials,
              productIds: batchIds,
              syncStateId: syncState._id.toString(),
              forceFullSync,
            },
            {
              // Each batch depends on the completion of the previous batch
              // This helps maintain order and prevents overloading the API
              priority: i,
            }
          );

          batchJobs.push(batchJob.id);
        }

        // Update sync state with batch jobs
        syncState.lastSyncStats.batchJobs = {
          total: batchJobs.length,
          completed: 0,
          failed: 0,
          pending: batchJobs.length,
          ids: batchJobs,
        };
        await syncState.save();

        // Update job progress
        await job.updateProgress(30);

        logger.info(
          `Created ${batchJobs.length} batch jobs for processing products`
        );

        // Return job result
        return {
          storeId,
          productCount: productIds.length,
          batchCount: batchJobs.length,
          syncStateId: syncState._id.toString(),
        };
      } catch (error) {
        logger.error(`Error in product sync job for store ${storeId}:`, error);

        // Update sync state with error
        const syncState = await SyncStateModel.findById(syncStateId);
        if (syncState) {
          syncState.isInProgress = false;
          syncState.lastSyncError = error.message;
          syncState.lastSyncStats.completedAt = new Date();
          await syncState.save();
        }

        // Re-throw to trigger retry mechanism
        throw error;
      }
    },
    {
      connection: redisOptions,
      concurrency: 1, // Process one sync job at a time
    }
  );

  // Product batch processing worker
  const batchWorker = new Worker<ProcessProductBatchJob>(
    "process-product-batch",
    async (job) => {
      const {
        storeId,
        shopCredentials,
        productIds,
        syncStateId,
        forceFullSync,
      } = job.data;

      try {
        logger.info(
          `Processing batch of ${productIds.length} products for store ${storeId}`,
          { jobId: job.id }
        );

        // Find the sync state
        const syncState = await SyncStateModel.findById(syncStateId);
        if (!syncState) {
          throw new Error(`Sync state ${syncStateId} not found`);
        }

        // Initialize Shopify API
        const shopify = new ShopifyAPI(shopCredentials);

        // Update batch job status
        if (!syncState.lastSyncStats.batchJobs) {
          syncState.lastSyncStats.batchJobs = {
            total: 0,
            completed: 0,
            failed: 0,
            pending: 0,
            ids: [],
          };
        }

        // Fetch product details
        const batchErrors = [];
        let processedCount = 0;
        let createdCount = 0;
        let updatedCount = 0;

        // Update job progress
        await job.updateProgress(10);

        // Process products in smaller chunks to provide progress updates
        const chunkSize = 10;
        for (let i = 0; i < productIds.length; i += chunkSize) {
          const chunk = productIds.slice(i, i + chunkSize);

          // Fetch detailed product information
          const productPromises = chunk.map((id) => shopify.getProduct(id));
          const products = await Promise.all(productPromises);

          // Update job progress
          await job.updateProgress(
            10 + Math.floor((90 * (i + chunk.length)) / productIds.length)
          );

          // Process each product in the chunk
          for (const shopifyProduct of products) {
            try {
              // Convert Shopify product to our model format
              const productData = {
                storeId,
                productId: shopifyProduct.id,
                title: shopifyProduct.title,
                description: shopifyProduct.description,
                handle: shopifyProduct.handle,
                productType: shopifyProduct.product_type,
                vendor: shopifyProduct.vendor,
                tags: shopifyProduct.tags,
                variants: shopifyProduct.variants.map((v: any) => ({
                  variantId: v.id,
                  price: v.price,
                  sku: v.sku,
                  compareAtPrice: v.compare_at_price,
                  inventoryQuantity: v.inventory_quantity,
                  inventoryItemId: v.inventory_item_id,
                })),
                shopifyCreatedAt: new Date(shopifyProduct.created_at),
                shopifyUpdatedAt: new Date(shopifyProduct.updated_at),
              };

              // Try to find an existing product or create a new one
              const existingProduct = await ProductModel.findOne({
                storeId,
                productId: shopifyProduct.id,
              });

              if (existingProduct) {
                // Update existing product
                await ProductModel.updateOne(
                  { storeId, productId: shopifyProduct.id },
                  productData
                );
                updatedCount++;
              } else {
                // Create new product
                await ProductModel.create(productData);
                createdCount++;
              }

              processedCount++;

              // If doing a full sync, remove from existingProductIds in the sync state
              if (forceFullSync && syncState.lastSyncStats.existingProductIds) {
                const index =
                  syncState.lastSyncStats.existingProductIds.indexOf(
                    shopifyProduct.id
                  );
                if (index >= 0) {
                  syncState.lastSyncStats.existingProductIds.splice(index, 1);
                }
              }
            } catch (productError) {
              logger.error(
                `Error processing product ${shopifyProduct.id}:`,
                productError
              );
              batchErrors.push({
                productId: shopifyProduct.id,
                error: productError.message,
              });
            }
          }
        }

        // Update sync state with batch results
        syncState.lastSyncStats.productsProcessed += processedCount;
        syncState.lastSyncStats.productsCreated += createdCount;
        syncState.lastSyncStats.productsUpdated += updatedCount;
        syncState.lastSyncStats.errors.push(...batchErrors);

        // Update batch job status
        syncState.lastSyncStats.batchJobs.completed += 1;
        syncState.lastSyncStats.batchJobs.pending -= 1;

        await syncState.save();

        logger.info(
          `Completed batch processing: ${processedCount} products (${createdCount} created, ${updatedCount} updated, ${batchErrors.length} errors)`
        );

        // Return job result
        return {
          processedCount,
          createdCount,
          updatedCount,
          errorCount: batchErrors.length,
        };
      } catch (error) {
        logger.error(`Error in product batch job for store ${storeId}:`, error);

        // Update sync state with batch error
        const syncState = await SyncStateModel.findById(syncStateId);
        if (syncState && syncState.lastSyncStats.batchJobs) {
          syncState.lastSyncStats.batchJobs.failed += 1;
          syncState.lastSyncStats.batchJobs.pending -= 1;
          syncState.lastSyncStats.errors.push({
            productId: "batch",
            error: error.message,
          });
          await syncState.save();
        }

        // Re-throw to trigger retry mechanism
        throw error;
      }
    },
    {
      connection: redisOptions,
      concurrency: 5, // Process multiple batches concurrently, adjust based on your needs
    }
  );

  // Handle sync job completed event
  syncQueueEvents.on("completed", async ({ jobId }) => {
    logger.info(`Sync job ${jobId} completed`);
  });

  // Handle all batch jobs completed event
  batchQueueEvents.on("completed", async ({ jobId }) => {
    // Find the job to get the syncStateId
    const job = await productBatchQueue.getJob(jobId);
    if (!job) {
      logger.error(`Completed batch job ${jobId} not found`);
      return;
    }

    const { syncStateId, forceFullSync } = job.data;
    logger.info(`Batch job ${jobId} completed for sync ${syncStateId}`);

    // Find the sync state
    const syncState = await SyncStateModel.findById(syncStateId);
    if (!syncState) {
      logger.error(
        `Sync state ${syncStateId} not found for completed batch job ${jobId}`
      );
      return;
    }

    // Update batch job status if not already done
    if (!syncState.lastSyncStats.batchJobs) {
      syncState.lastSyncStats.batchJobs = {
        total: 0,
        completed: 0,
        failed: 0,
        pending: 0,
        ids: [],
      };
    }

    // Increment completed count and decrement pending count
    syncState.lastSyncStats.batchJobs.completed += 1;
    syncState.lastSyncStats.batchJobs.pending = Math.max(
      0,
      syncState.lastSyncStats.batchJobs.pending - 1
    );

    // Make sure to save this update
    try {
      await syncState.save();
      logger.debug(
        `Updated batch job status for sync ${syncStateId}: ${syncState.lastSyncStats.batchJobs.completed}/${syncState.lastSyncStats.batchJobs.total} completed`
      );
    } catch (saveError) {
      logger.error(
        `Error saving sync state after batch completion: ${saveError.message}`,
        saveError
      );
    }

    // Check if all batch jobs are completed
    const allCompleted =
      syncState.lastSyncStats.batchJobs &&
      syncState.lastSyncStats.batchJobs.completed +
        syncState.lastSyncStats.batchJobs.failed ===
        syncState.lastSyncStats.batchJobs.total;

    if (allCompleted) {
      logger.info(`All batch jobs completed for sync ${syncStateId}`);

      try {
        // Handle deleted products if doing a full sync
        if (
          forceFullSync &&
          syncState.lastSyncStats.existingProductIds &&
          syncState.lastSyncStats.existingProductIds.length > 0
        ) {
          const productsToDelete = syncState.lastSyncStats.existingProductIds;
          logger.info(
            `Removing ${productsToDelete.length} products that no longer exist in Shopify`
          );

          try {
            // Delete the products
            const result = await ProductModel.deleteMany({
              storeId: syncState.storeId,
              productId: { $in: productsToDelete },
            });

            syncState.lastSyncStats.productsDeleted = result.deletedCount || 0;
          } catch (error) {
            logger.error(`Error deleting products:`, error);
            syncState.lastSyncStats.errors.push({
              productId: "deletion",
              error: error.message,
            });
          }
        }

        // Calculate duration
        const startTime = syncState.lastSyncStats.startedAt.getTime();
        const endTime = Date.now();
        const duration = endTime - startTime;

        // Update sync state with final stats
        syncState.isInProgress = false;
        syncState.lastSyncedAt = new Date();
        syncState.lastSyncDuration = duration;
        syncState.totalSyncs += 1;
        syncState.totalProductsProcessed +=
          syncState.lastSyncStats.productsProcessed;
        syncState.totalProductsCreated +=
          syncState.lastSyncStats.productsCreated;
        syncState.totalProductsUpdated +=
          syncState.lastSyncStats.productsUpdated;
        syncState.totalProductsDeleted +=
          syncState.lastSyncStats.productsDeleted;
        syncState.lastSyncStats.completedAt = new Date();

        // Save the final state with extra logging and error handling
        try {
          await syncState.save();
          logger.info("Successfully saved final sync state", { syncStateId });
        } catch (finalSaveError) {
          logger.error(
            `CRITICAL ERROR: Failed to save final sync state: ${finalSaveError.message}`,
            finalSaveError
          );

          // Try one more time with only essential fields
          try {
            await SyncStateModel.updateOne(
              { _id: syncState._id },
              {
                $set: {
                  isInProgress: false,
                  lastSyncedAt: new Date(),
                  lastSyncDuration: duration,
                  "lastSyncStats.completedAt": new Date(),
                },
              }
            );
            logger.info(
              "Updated sync state with minimal fields after save error"
            );
          } catch (fallbackError) {
            logger.error("Failed fallback update of sync state", fallbackError);
          }
        }

        logger.info("Product sync completed", {
          syncStateId,
          productsProcessed: syncState.lastSyncStats.productsProcessed,
          productsUpdated: syncState.lastSyncStats.productsUpdated,
          productsCreated: syncState.lastSyncStats.productsCreated,
          productsDeleted: syncState.lastSyncStats.productsDeleted,
          errors: syncState.lastSyncStats.errors.length,
          durationMs: duration,
          durationFormatted: `${Math.floor(duration / 60000)}m ${Math.floor(
            (duration % 60000) / 1000
          )}s`,
        });
      } catch (finalError) {
        logger.error(
          `Error in final sync completion processing: ${finalError.message}`,
          finalError
        );
      }
    }
  });

  // Handle failed jobs
  syncQueueEvents.on("failed", async ({ jobId, failedReason }) => {
    logger.error(`Sync job ${jobId} failed:`, failedReason);
  });
  batchQueueEvents.on("failed", async ({ jobId, failedReason }) => {
    logger.error(`Batch job ${jobId} failed:`, failedReason);

    // Find the job to get the syncStateId
    const job = await productBatchQueue.getJob(jobId);
    if (!job) return;

    const { syncStateId } = job.data;

    // Find the sync state
    const syncState = await SyncStateModel.findById(syncStateId);
    if (!syncState) return;

    // Update batch job status
    if (syncState.lastSyncStats.batchJobs) {
      syncState.lastSyncStats.batchJobs.failed += 1;
      syncState.lastSyncStats.batchJobs.pending -= 1;

      // Add error
      syncState.lastSyncStats.errors.push({
        productId: `batch-${jobId}`,
        error: failedReason,
      });

      await syncState.save();

      // Check if all batches are now complete (including failed ones)
      if (
        syncState.lastSyncStats.batchJobs.completed +
          syncState.lastSyncStats.batchJobs.failed ===
        syncState.lastSyncStats.batchJobs.total
      ) {
        logger.info(
          `All batch jobs completed (including failures) for sync ${syncStateId}`
        );

        // Calculate duration
        const startTime = syncState.lastSyncStats.startedAt.getTime();
        const endTime = Date.now();
        const duration = endTime - startTime;

        // Update sync state with final stats
        syncState.isInProgress = false;
        syncState.lastSyncedAt = new Date();
        syncState.lastSyncDuration = duration;
        syncState.totalSyncs += 1;
        syncState.totalProductsProcessed +=
          syncState.lastSyncStats.productsProcessed;
        syncState.totalProductsCreated +=
          syncState.lastSyncStats.productsCreated;
        syncState.totalProductsUpdated +=
          syncState.lastSyncStats.productsUpdated;
        syncState.lastSyncStats.completedAt = new Date();

        // Add an error indicating that not all batches succeeded
        if (syncState.lastSyncStats.batchJobs.failed > 0) {
          syncState.lastSyncError = `Sync completed with ${syncState.lastSyncStats.batchJobs.failed} failed batch jobs`;
        }

        await syncState.save();

        logger.info("Product sync completed with some failures", {
          syncStateId,
          productsProcessed: syncState.lastSyncStats.productsProcessed,
          productsUpdated: syncState.lastSyncStats.productsUpdated,
          productsCreated: syncState.lastSyncStats.productsCreated,
          failedBatches: syncState.lastSyncStats.batchJobs.failed,
          errors: syncState.lastSyncStats.errors.length,
          durationMs: duration,
        });
      }
    }
  });
  // Return the workers and queues for cleanup
  return {
    syncWorker,
    batchWorker,
    syncQueue,
    productBatchQueue,
    syncQueueEvents,
    batchQueueEvents,
  };
}

// Function to add a sync job to the queue
export async function queueProductSync(
  storeId: string,
  shopCredentials: {
    shopName: string;
    accessToken: string;
  },
  options: {
    filters?: ProductFilters;
    limit?: number | "all";
    batchSize?: number;
    forceFullSync?: boolean;
  } = {}
): Promise<{ jobId: string; syncStateId: string }> {
  // Get or create sync state
  let syncState = await SyncStateModel.findOne({
    storeId,
    syncType: "products",
  });

  if (!syncState) {
    syncState = new SyncStateModel({
      storeId,
      syncType: "products",
      totalSyncs: 0,
      lastSyncStats: {
        // errors: [],
      },
    });
  }

  // Check if sync is already in progress TODO: fix uncomment code
  //   if (syncState.isInProgress) {
  //     throw new Error("A product sync is already in progress for this store");
  //   }

  // Prepare for new sync
  syncState.isInProgress = true;
  syncState.lastSyncStats = {
    startedAt: new Date(),
    completedAt: new Date(), // Will be updated later
    totalProductsToProcess: 0,
    productsProcessed: 0,
    productsCreated: 0,
    productsUpdated: 0,
    productsDeleted: 0,
    errors: [],
    batchJobs: {
      total: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      ids: [],
    },
    existingProductIds: [],
  };
  await syncState.save();

  // Set default options
  const {
    filters = {},
    limit = "all",
    batchSize = 100,
    forceFullSync = false,
  } = options;

  // Add the job to the queue
  const job = await syncQueue.add("sync-products", {
    storeId,
    shopCredentials,
    filters,
    limit,
    batchSize,
    forceFullSync,
    syncStateId: syncState._id.toString(),
  });

  logger.info(`Queued product sync job ${job.id} for store ${storeId}`);

  return {
    jobId: job.id,
    syncStateId: syncState._id.toString(),
  };
}

// Function to get sync queue stats
export async function getSyncQueueStats() {
  const [
    syncWaiting,
    syncActive,
    syncCompleted,
    syncFailed,
    batchWaiting,
    batchActive,
    batchCompleted,
    batchFailed,
  ] = await Promise.all([
    syncQueue.getWaitingCount(),
    syncQueue.getActiveCount(),
    syncQueue.getCompletedCount(),
    syncQueue.getFailedCount(),
    productBatchQueue.getWaitingCount(),
    productBatchQueue.getActiveCount(),
    productBatchQueue.getCompletedCount(),
    productBatchQueue.getFailedCount(),
  ]);

  return {
    sync: {
      waiting: syncWaiting,
      active: syncActive,
      completed: syncCompleted,
      failed: syncFailed,
      total: syncWaiting + syncActive + syncCompleted + syncFailed,
    },
    batch: {
      waiting: batchWaiting,
      active: batchActive,
      completed: batchCompleted,
      failed: batchFailed,
      total: batchWaiting + batchActive + batchCompleted + batchFailed,
    },
  };
}

// Function to clean up resources when shutting down
export async function shutdownSyncWorkers() {
  // Get the workers and queues
  const { syncWorker, batchWorker, syncQueueEvents, batchQueueEvents } =
    initSyncWorkers();

  // Close the workers and queue events
  await syncWorker.close();
  await batchWorker.close();
  await syncQueueEvents.close();
  await batchQueueEvents.close();

  // Close the queues
  await syncQueue.close();
  await productBatchQueue.close();

  logger.info("Sync workers and queues shut down");
}
