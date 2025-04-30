// src/routes/api.ts
import express, { Request, Response, NextFunction } from "express";
import { ShopifyAPI } from "../services/shopify-api";
import { QueueService } from "../services/queue";
import { JobTracker } from "../services/job-tracker";
import { ShopifyCredentials, ProductFilters } from "../types";
import logger from "../utils/logger";
import { ProductModel } from "../models/product";
import { SyncStateModel } from "../models/sync-state";

const router = express.Router();

// Middleware to validate Shopify credentials - fixed TypeScript typing
// Middleware to validate Shopify credentials using headers
const validateShopifyCredentials = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const shopName = req.header("X-Shopify-Shop");
  const accessToken = req.header("Authorization")?.replace("Bearer ", "");

  if (!shopName || !accessToken) {
    res.status(401).json({
      success: false,
      error:
        "Authentication failed. Required headers: X-Shopify-Shop and Authorization",
    });
    return;
  }

  // Add the credentials to the request for use in the route handlers
  req.shopifyCredentials = {
    shopName,
    accessToken,
  };

  next();
};

// Middleware to validate job IDs - fixed TypeScript typing
const validateJobId = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { jobId } = req.params;

  if (!jobId) {
    res.status(400).json({
      success: false,
      error: "Job ID is required",
    });
    return;
  }

  try {
    const jobExists = await JobTracker.getJobStatus(jobId);
    if (!jobExists) {
      res.status(404).json({
        success: false,
        error: "Job not found",
      });
      return;
    }
    next();
  } catch (error) {
    res.status(404).json({
      success: false,
      error: "Job not found",
    });
    return;
  }
};

// API endpoint to sync products with MongoDB
router.post(
  "/sync-products",
  validateShopifyCredentials,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Get parameters from request
      const {
        filters = {},
        limit = "all",
        batchSize = 100,
        forceFullSync = false, // If true, ignore lastSyncedAt and do a full sync
      } = req.body;

      // Get store identifier from shop credentials
      const storeId = req.shopifyCredentials.shopName;

      // Check if a sync is already in progress
      const existingSyncState = await SyncStateModel.findOne({
        storeId,
        syncType: "products",
        isInProgress: true,
      });

      if (existingSyncState) {
        res.status(409).json({
          success: false,
          error: "A product sync is already in progress for this store",
          syncState: existingSyncState,
        });
        return;
      }

      // Initialize Shopify API
      const shopify = new ShopifyAPI(req.shopifyCredentials);

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
            errors: [],
          },
        });
      }

      // Prepare for new sync
      syncState.isInProgress = true;
      syncState.lastSyncStats = {
        startedAt: new Date(),
        completedAt: new Date(), // Will be updated later
        productsProcessed: 0,
        productsCreated: 0,
        productsUpdated: 0,
        productsDeleted: 0,
        errors: [],
      };
      await syncState.save();

      // Add filters for incremental sync if not doing a force full sync
      let incrementalFilters = { ...filters };
      if (!forceFullSync && syncState.lastSyncedAt) {
        // Filter products updated since last sync
        incrementalFilters.updatedAtMin = syncState.lastSyncedAt.toISOString();
        logger.info(
          `Performing incremental sync since ${syncState.lastSyncedAt.toISOString()}`
        );
      } else {
        logger.info("Performing full sync");
      }

      // Send initial response
      res.json({
        success: true,
        message: "Product sync started",
        syncState,
        incremental: !forceFullSync && !!syncState.lastSyncedAt,
      });

      // Continue processing in the background
      processSyncInBackground(
        shopify,
        incrementalFilters,
        limit,
        batchSize,
        syncState,
        forceFullSync
      );
    } catch (error) {
      logger.error("Failed to start product sync:", error);
      res.status(500).json({
        success: false,
        error:
          error.message || "An error occurred while starting the product sync",
      });
    }
  }
);

// API endpoint to check sync status
router.get(
  "/sync-status",
  validateShopifyCredentials,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const storeId = req.shopifyCredentials.shopName;
      const syncType = (req.query.type as string) || "products";

      const syncState = await SyncStateModel.findOne({
        storeId,
        syncType,
      });

      if (!syncState) {
        res.status(404).json({
          success: false,
          error: `No sync history found for ${syncType}`,
        });
        return;
      }

      res.json({
        success: true,
        syncState,
      });
    } catch (error) {
      logger.error("Error fetching sync status:", error);
      res.status(500).json({
        success: false,
        error: error.message || "An error occurred while fetching sync status",
      });
    }
  }
);

// Background processing function with state tracking
async function processSyncInBackground(
  shopify: ShopifyAPI,
  filters: ProductFilters,
  limit: number | "all",
  batchSize: number,
  syncState: ISyncState,
  forceFullSync: boolean
) {
  try {
    const startTime = Date.now();

    // Get product IDs (either all or a limited number)
    const productIds = await shopify.getProductIds(filters, {
      limit,
      batchSize,
    });

    logger.info(
      `Retrieved ${productIds.length} product IDs, beginning detailed sync`
    );

    // If doing a full sync and there are deleted products, we need to track that
    let existingProductIds: string[] = [];
    if (forceFullSync) {
      // Get all product IDs from our database for this store
      existingProductIds = await ProductModel.distinct("productId");
    }

    // Process products in batches
    for (let i = 0; i < productIds.length; i += batchSize) {
      const batchIds = productIds.slice(i, i + batchSize);

      // Fetch detailed product information for each batch
      const productPromises = batchIds.map((id) => shopify.getProduct(id));
      const products = await Promise.all(productPromises);

      // Process each product
      for (const shopifyProduct of products) {
        try {
          // Convert Shopify product to our model format
          const productData = {
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
            productId: shopifyProduct.id,
          });

          if (existingProduct) {
            // Update existing product
            await ProductModel.updateOne(
              { productId: shopifyProduct.id },
              productData
            );
            syncState.lastSyncStats.productsUpdated++;
          } else {
            // Create new product
            await ProductModel.create(productData);
            syncState.lastSyncStats.productsCreated++;
          }

          syncState.lastSyncStats.productsProcessed++;

          // Remove from existingProductIds since we've processed it
          if (forceFullSync) {
            const index = existingProductIds.indexOf(shopifyProduct.id);
            if (index >= 0) {
              existingProductIds.splice(index, 1);
            }
          }

          // Log progress occasionally
          if (syncState.lastSyncStats.productsProcessed % 100 === 0) {
            logger.info(
              `Sync progress: ${syncState.lastSyncStats.productsProcessed}/${productIds.length} products processed`
            );

            // Update sync state to show progress
            syncState.lastSyncStats.completedAt = new Date();
            await syncState.save();
          }
        } catch (productError) {
          logger.error(
            `Error processing product ${shopifyProduct.id}:`,
            productError
          );
          syncState.lastSyncStats.errors.push({
            productId: shopifyProduct.id,
            error: productError.message,
          });
          await syncState.save();
        }
      }

      // Add a small delay between batches to avoid overwhelming the API
      if (i + batchSize < productIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Handle deleted products if doing a full sync
    if (forceFullSync && existingProductIds.length > 0) {
      logger.info(
        `Removing ${existingProductIds.length} products that no longer exist in Shopify`
      );

      // Delete in batches
      for (let i = 0; i < existingProductIds.length; i += batchSize) {
        const deleteBatch = existingProductIds.slice(i, i + batchSize);
        await ProductModel.deleteMany({ productId: { $in: deleteBatch } });
      }

      syncState.lastSyncStats.productsDeleted = existingProductIds.length;
    }

    // Calculate duration
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Update sync state with final stats
    syncState.isInProgress = false;
    syncState.lastSyncedAt = new Date();
    syncState.lastSyncDuration = duration;
    syncState.totalSyncs += 1;
    syncState.totalProductsProcessed +=
      syncState.lastSyncStats.productsProcessed;
    syncState.totalProductsCreated += syncState.lastSyncStats.productsCreated;
    syncState.totalProductsUpdated += syncState.lastSyncStats.productsUpdated;
    syncState.totalProductsDeleted += syncState.lastSyncStats.productsDeleted;
    syncState.lastSyncStats.completedAt = new Date();
    await syncState.save();

    logger.info("Product sync completed", {
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
  } catch (error) {
    logger.error("Product sync failed:", error);

    // Update sync state with error
    syncState.isInProgress = false;
    syncState.lastSyncError = error.message;
    syncState.lastSyncStats.completedAt = new Date();
    await syncState.save();
  }
}

// API endpoint to get product IDs
router.get(
  "/products",
  validateShopifyCredentials,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Get query parameters for filtering
      const filters: ProductFilters = {
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        productType: (req.query.productType as string) || undefined,
        vendor: (req.query.vendor as string) || undefined,
        createdAtMin: (req.query.createdAtMin as string) || undefined,
        createdAtMax: (req.query.createdAtMax as string) || undefined,
        updatedAtMin: (req.query.updatedAtMin as string) || undefined,
        updatedAtMax: (req.query.updatedAtMax as string) || undefined,
      };

      // Validate limit
      if (filters.limit && (filters.limit > 250 || filters.limit < 1)) {
        res.status(400).json({
          success: false,
          error: "Limit must be between 1 and 250",
        });
        return;
      }

      // Initialize Shopify API using the credentials from middleware
      const shopify = new ShopifyAPI(req.shopifyCredentials);

      // Get product IDs with the specified filters
      logger.info("Fetching product IDs", { filters });
      const productIds = await shopify.getProductIds(filters);

      // Send response
      res.json({
        success: true,
        count: productIds.length,
        productIds: productIds,
      });
    } catch (error) {
      logger.error("Error fetching product IDs:", error);
      res.status(500).json({
        success: false,
        error: error.message || "An error occurred while fetching product IDs",
      });
    }
  }
);

router.get(
  "/shop",
  validateShopifyCredentials,
  async (req: Request, res: Response) => {
    try {
      const shopify = new ShopifyAPI(req.shopifyCredentials);

      const shop = await shopify.getShopInfo();

      console.log("Shop info:", shop);

      return res.json({
        success: true,
        ...shop,
      });
    } catch (error) {
      logger.error("Failed to fetch shop info:", error);
      res.status(500).json({
        success: false,
        error: error.message || "An error occurred while fetching shop info",
      });
    }
  }
);

// API endpoint to start a batch processing job - fixed TypeScript typing
router.post(
  "/process-products",
  validateShopifyCredentials,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { shopCredentials, processingAction, filters, actionData } =
        req.body;

      // Validate required action param
      if (!processingAction) {
        res.status(400).json({
          success: false,
          error: "Processing action is required",
        });
        return;
      }

      // Validate supported actions
      const supportedActions = [
        "updateTags",
        "updateInventory",
        "updatePrice",
        "updateMetafield",
      ];
      if (!supportedActions.includes(processingAction)) {
        res.status(400).json({
          success: false,
          error: `Unsupported action. Supported actions: ${supportedActions.join(
            ", "
          )}`,
        });
        return;
      }

      // Validate action-specific data
      if (
        processingAction === "updateTags" &&
        (!actionData?.tags || !Array.isArray(actionData.tags))
      ) {
        res.status(400).json({
          success: false,
          error: "Tags array is required for updateTags action",
        });
        return;
      }

      if (
        processingAction === "updateInventory" &&
        (actionData?.inventory === undefined ||
          typeof actionData.inventory !== "number")
      ) {
        res.status(400).json({
          success: false,
          error: "Inventory number is required for updateInventory action",
        });
        return;
      }

      if (
        processingAction === "updatePrice" &&
        (actionData?.price === undefined ||
          typeof actionData.price !== "number")
      ) {
        res.status(400).json({
          success: false,
          error: "Price number is required for updatePrice action",
        });
        return;
      }

      if (
        processingAction === "updateMetafield" &&
        (!actionData?.namespace ||
          !actionData?.key ||
          !actionData?.value ||
          !actionData?.type)
      ) {
        res.status(400).json({
          success: false,
          error:
            "Namespace, key, value, and type are required for updateMetafield action",
        });
        return;
      }

      logger.info("Starting batch processing job", {
        action: processingAction,
        shop: shopCredentials.shopName,
        filters,
      });

      // Initialize the Shopify API service
      const shopify = new ShopifyAPI(shopCredentials);

      // Get product IDs based on filters
      const productIds = await shopify.getProductIds(filters || {});

      if (productIds.length === 0) {
        res.status(400).json({
          success: false,
          error: "No products found with the specified filters",
        });
        return;
      }

      // Create a new job in the tracker
      const jobId = await JobTracker.createJob({
        totalProducts: productIds.length,
        status: "queued",
        action: processingAction,
        timestamp: new Date(),
      });

      // Prepare tasks for the queue
      const tasks = productIds.map((id) => ({
        productId: id,
        action: processingAction,
        jobId,
        shopCredentials,
        ...actionData,
      }));

      // Add products to the queue
      await QueueService.addBatch(tasks);

      logger.info(`Created job ${jobId} with ${productIds.length} products`);

      res.json({
        success: true,
        jobId,
        totalProducts: productIds.length,
      });
    } catch (error) {
      logger.error("Failed to start processing job:", error);
      res.status(500).json({
        success: false,
        error: error.message || "An error occurred while starting the job",
      });
    }
  }
);

// API endpoint to check job status - fixed TypeScript typing
router.get(
  "/job/:jobId",
  validateJobId,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { jobId } = req.params;
      const jobStatus = await JobTracker.getJobStatus(jobId);
      res.json(jobStatus);
    } catch (error) {
      logger.error(`Error fetching job status for ${req.params.jobId}:`, error);
      res.status(500).json({
        success: false,
        error: error.message || "An error occurred while fetching job status",
      });
    }
  }
);

// API endpoint to get detailed job info - fixed TypeScript typing
router.get(
  "/job/:jobId/details",
  validateJobId,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { jobId } = req.params;
      const jobDetails = await JobTracker.getJobDetails(jobId);

      if (!jobDetails) {
        res.status(404).json({
          success: false,
          error: "Job not found",
        });
        return;
      }

      res.json(jobDetails);
    } catch (error) {
      logger.error(
        `Error fetching job details for ${req.params.jobId}:`,
        error
      );
      res.status(500).json({
        success: false,
        error: error.message || "An error occurred while fetching job details",
      });
    }
  }
);

// API endpoint to list jobs - fixed TypeScript typing
router.get("/jobs", async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = parseInt(req.query.skip as string) || 0;

    if (limit > 100) {
      res.status(400).json({
        success: false,
        error: "Limit cannot exceed 100",
      });
      return;
    }

    const jobs = await JobTracker.listJobs(limit, skip);
    res.json({
      success: true,
      total: jobs.length,
      limit,
      skip,
      jobs,
    });
  } catch (error) {
    logger.error("Error listing jobs:", error);
    res.status(500).json({
      success: false,
      error: error.message || "An error occurred while listing jobs",
    });
  }
});

// API endpoint to delete a job - fixed TypeScript typing
router.delete(
  "/job/:jobId",
  validateJobId,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { jobId } = req.params;
      const deleted = await JobTracker.deleteJob(jobId);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: "Job not found",
        });
        return;
      }

      logger.info(`Deleted job ${jobId}`);
      res.json({ success: true });
    } catch (error) {
      logger.error(`Error deleting job ${req.params.jobId}:`, error);
      res.status(500).json({
        success: false,
        error: error.message || "An error occurred while deleting the job",
      });
    }
  }
);

// API endpoint to get queue stats - fixed TypeScript typing
router.get(
  "/queue/stats",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await QueueService.getQueueStats();
      res.json({
        success: true,
        stats,
      });
    } catch (error) {
      logger.error("Error fetching queue stats:", error);
      res.status(500).json({
        success: false,
        error: error.message || "An error occurred while fetching queue stats",
      });
    }
  }
);

// API endpoints to control the queue - fixed TypeScript typing
router.post(
  "/queue/pause",
  async (req: Request, res: Response): Promise<void> => {
    try {
      await QueueService.pauseQueue();
      logger.info("Queue paused");
      res.json({ success: true, message: "Queue paused" });
    } catch (error) {
      logger.error("Error pausing queue:", error);
      res.status(500).json({
        success: false,
        error: error.message || "An error occurred while pausing the queue",
      });
    }
  }
);

router.post(
  "/queue/resume",
  async (req: Request, res: Response): Promise<void> => {
    try {
      await QueueService.resumeQueue();
      logger.info("Queue resumed");
      res.json({ success: true, message: "Queue resumed" });
    } catch (error) {
      logger.error("Error resuming queue:", error);
      res.status(500).json({
        success: false,
        error: error.message || "An error occurred while resuming the queue",
      });
    }
  }
);

router.post(
  "/queue/clear",
  async (req: Request, res: Response): Promise<void> => {
    try {
      await QueueService.clearQueue();
      logger.info("Queue cleared");
      res.json({ success: true, message: "Queue cleared" });
    } catch (error) {
      logger.error("Error clearing queue:", error);
      res.status(500).json({
        success: false,
        error: error.message || "An error occurred while clearing the queue",
      });
    }
  }
);

export default router;
