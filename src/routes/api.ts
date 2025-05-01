// src/routes/api.ts
import express, { Request, Response, NextFunction } from "express";
import { ShopifyAPI } from "../services/shopify-api";
import { QueueService } from "../services/queue";
import { JobTracker } from "../services/job-tracker";
import { ProductFilters } from "../types";
import logger from "../utils/logger";
import { SyncStateModel } from "../models/sync-state";
import { getSyncQueueStats, queueProductSync } from "../services/sync-queue";

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

// API endpoint to sync products with MongoDB using BullMQ
router.post(
  "/sync-products",
  validateShopifyCredentials,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Get parameters from request
      const {
        filters = {},
        limit = req.body.limit || 50,
        batchSize = 100,
        forceFullSync = false,
      } = req.body;

      // Get store identifier from shop credentials
      const storeId = req.shopifyCredentials.shopName;

      try {
        // Queue the sync job
        const { jobId, syncStateId } = await queueProductSync(
          storeId,
          req.shopifyCredentials,
          {
            filters,
            limit,
            batchSize,
            forceFullSync,
          }
        );

        // Get the sync state
        const syncState = await SyncStateModel.findById(syncStateId);

        // Send response
        res.json({
          success: true,
          message: "Product sync queued",
          jobId,
          syncStateId,
          syncState,
          incremental: !forceFullSync && !!syncState?.lastSyncedAt,
        });
      } catch (queueError) {
        const error = queueError as Error;
        // If there's already a sync in progress, return 409 Conflict
        if (error.message.includes("already in progress")) {
          const syncState = await SyncStateModel.findOne({
            storeId,
            syncType: "products",
            isInProgress: true,
          });

          res.status(409).json({
            success: false,
            error: error.message,
            syncState,
          });
          return;
        }

        // Otherwise rethrow the error
        throw queueError;
      }
    } catch (error) {
      logger.error("Failed to queue product sync:", error);
      res.status(500).json({
        success: false,
        error:
          error.message || "An error occurred while queuing the product sync",
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

      // Get queue stats if the sync is in progress
      let queueStats;
      if (syncState.isInProgress) {
        queueStats = await getSyncQueueStats();
      }

      res.json({
        success: true,
        syncState,
        queueStats,
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

// API endpoint to get queue stats
router.get(
  "/sync-queue-stats",
  validateShopifyCredentials,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await getSyncQueueStats();

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

// API endpoint to manually check and fix stuck syncs
router.post(
  "/fix-stuck-syncs",
  validateShopifyCredentials,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Find syncs that are in progress
      const stuckSyncs = await SyncStateModel.find({
        isInProgress: true,
      });

      const results = [];

      // For each stuck sync, check if all batch jobs are completed
      for (const syncState of stuckSyncs) {
        // Check when this sync was started
        const startTime = syncState.lastSyncStats.startedAt?.getTime() || 0;
        const duration = Date.now() - startTime;
        const durationMinutes = Math.floor(duration / 60000);

        // Check batch job status
        const batchJobsTotal = syncState.lastSyncStats.batchJobs?.total || 0;
        const batchJobsCompleted =
          syncState.lastSyncStats.batchJobs?.completed || 0;
        const batchJobsFailed = syncState.lastSyncStats.batchJobs?.failed || 0;

        const allBatchesComplete =
          batchJobsTotal > 0 &&
          batchJobsCompleted + batchJobsFailed >= batchJobsTotal;

        // If all batches are complete or it's been stuck for over 30 minutes
        if (allBatchesComplete || durationMinutes > 30) {
          // Mark as complete
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

          if (!allBatchesComplete) {
            syncState.lastSyncError = `Sync automatically marked as complete after ${durationMinutes} minutes`;
          }

          await syncState.save();
          logger.info(
            `Sync ${syncState._id} marked as complete after ${durationMinutes} minutes`
          );

          results.push({
            id: syncState._id,
            storeId: syncState.storeId,
            fixed: true,
            reason: allBatchesComplete ? "All batches complete" : "Timeout",
            duration: `${durationMinutes} minutes`,
          });
        } else {
          results.push({
            id: syncState._id,
            storeId: syncState.storeId,
            fixed: false,
            status: {
              duration: `${durationMinutes} minutes`,
              batches: `${batchJobsCompleted}/${batchJobsTotal} completed, ${batchJobsFailed} failed`,
            },
          });
        }
      }

      res.json({
        success: true,
        syncsChecked: stuckSyncs.length,
        results,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

export default router;
