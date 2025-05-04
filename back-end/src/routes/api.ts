// src/routes/api.ts
import express, { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import { IntegrationJobProcessor } from "../queues/IntegrationJobProcessor";
import { JobState } from "../models/JobState";
import { ProductModel } from "../models/product";
import { ShopifyAPI } from "../services/shopify-api";
const router = express.Router();

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
  (req as any).shopifyCredentials = {
    shopName,
    accessToken,
  };

  next();
};

// API endpoint to perform a full sync of products
router.post(
  "/sync-products",
  validateShopifyCredentials,
  async (req: Request, res: Response) => {
    try {
      // Create a full sync job
      const job = await IntegrationJobProcessor.createIncrementalJob(
        "shopify",
        "mongodb",
        {
          options: {
            // Add any job-specific options here
            shopName: (req as any).shopifyCredentials.shopName,
            accessToken: (req as any).shopifyCredentials.accessToken,
          },
        }
      );

      // Start the worker
      IntegrationJobProcessor.startWorker();

      res.json({
        success: true,
        message: "Full product sync started",
        data: {
          jobId: job.id,
          type: "full",
        },
      });
    } catch (error) {
      logger.error("Error starting full product sync:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// API endpoint to resume a failed job
router.post(
  "/sync-products/resume/:jobId",
  validateShopifyCredentials,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      // Find the job in the database
      const jobState = await JobState.findOne({ jobId });

      if (!jobState) {
        return res.status(404).json({
          success: false,
          error: `Job with ID ${jobId} not found`,
        });
      }

      if (jobState.status !== "FAILED") {
        return res.status(400).json({
          success: false,
          error: `Can only resume failed jobs. Current status: ${jobState.status}`,
        });
      }

      // Update job status back to CREATED to allow resuming
      await JobState.findByIdAndUpdate(jobState._id, {
        status: "CREATED",
        // Don't reset progress - we'll resume from where we left off
      });

      // Add the job back to the queue
      const job = await IntegrationJobProcessor.resumeJob(jobId, {
        options: {
          // Add any job-specific options here
          shopName: (req as any).shopifyCredentials.shopName,
          accessToken: (req as any).shopifyCredentials.accessToken,
        },
      });

      // Start the worker
      IntegrationJobProcessor.startWorker();

      res.json({
        success: true,
        message: "Job resumed successfully",
        data: {
          jobId: job.id,
          resumedFrom: jobState.progress,
        },
      });
    } catch (error) {
      logger.error("Error resuming job:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// API endpoint to get sync status information
router.get("/sync-status", async (req: Request, res: Response) => {
  try {
    const syncInfo = await IntegrationJobProcessor.getLatestSyncInfo(
      "shopify",
      "mongodb"
    );

    res.json({
      success: true,
      data: syncInfo,
    });
  } catch (error) {
    logger.error("Error getting sync status:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// API endpoint to get all jobs with their status
router.get("/sync-jobs", async (req: Request, res: Response) => {
  try {
    // Get query parameters for filtering
    const status = req.query.status as string | undefined;
    const limit = parseInt((req.query.limit as string) || "10");
    const page = parseInt((req.query.page as string) || "1");

    // Build the query
    const query: any = {};
    if (status) {
      query.status = status.toUpperCase();
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get jobs with pagination
    const jobs = await JobState.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const totalCount = await JobState.countDocuments(query);

    res.json({
      success: true,
      data: {
        jobs,
        pagination: {
          total: totalCount,
          page,
          limit,
          pages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    logger.error("Error getting jobs:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// API endpoint for diagnostics to check database operations
router.get("/sync-diagnostics", async (req: Request, res: Response) => {
  try {
    const storeId =
      (req.query.storeId as string) ||
      process.env.SHOPIFY_HOST ||
      "default-store";
    const productId = req.query.productId as string;

    // Test direct write to database
    if (productId) {
      // Create a test product
      const testProduct = new ProductModel({
        storeId,
        productId: `test-${productId}`,
        title: `Test Product ${Date.now()}`,
        handle: `test-product-${Date.now()}`,
        variants: [
          {
            variantId: `test-variant-${Date.now()}`,
            price: "9.99",
            sku: `TEST-SKU-${Date.now()}`,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        shopifyCreatedAt: new Date(),
        shopifyUpdatedAt: new Date(),
      });

      // Try to save it
      const savedProduct = await testProduct.save();

      return res.json({
        success: true,
        message: "Test product saved successfully",
        product: savedProduct,
        diagnostics: {
          dbConnection: "Connected",
          writeTest: "Successful",
        },
      });
    }

    // Get database stats
    const totalProducts = await ProductModel.countDocuments({ storeId });
    const recentProducts = await ProductModel.find({ storeId })
      .sort({ createdAt: -1 })
      .limit(5);

    // Get database connection status
    const dbState = mongoose.connection.readyState;
    let dbStateText;
    switch (dbState) {
      case 0:
        dbStateText = "Disconnected";
        break;
      case 1:
        dbStateText = "Connected";
        break;
      case 2:
        dbStateText = "Connecting";
        break;
      case 3:
        dbStateText = "Disconnecting";
        break;
      default:
        dbStateText = "Unknown";
    }

    // Get ongoing jobs
    const runningJobs = await JobState.find({ status: "RUNNING" })
      .sort({ createdAt: -1 })
      .limit(5);

    // Get latest completed job
    const latestJob = await JobState.findOne({ status: "COMPLETED" }).sort({
      updatedAt: -1,
    });

    res.json({
      success: true,
      diagnostics: {
        database: {
          connectionState: dbStateText,
          readyState: dbState,
        },
        products: {
          totalCount: totalProducts,
          recentProducts: recentProducts.map((p) => ({
            id: p.productId,
            title: p.title,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          })),
        },
        jobs: {
          running: runningJobs.map((j) => ({
            jobId: j.jobId,
            progress: j.progress,
            createdAt: j.createdAt,
            recordsProcessed: j.recordsSucceeded,
          })),
          latestCompleted: latestJob
            ? {
                jobId: latestJob.jobId,
                completedAt: latestJob.updatedAt,
                recordsProcessed: latestJob.recordsSucceeded,
                lastSyncTime: latestJob.lastSyncTime,
              }
            : null,
        },
      },
    });
  } catch (error) {
    logger.error("Error running diagnostics:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
});

// Add a direct test route for database operations
router.post("/test-db-write", async (req: Request, res: Response) => {
  try {
    const { storeId = "test-store", productId = `test-${Date.now()}` } =
      req.body;

    // Create a test product
    const testProduct = new ProductModel({
      storeId,
      productId,
      title: `Test Product ${productId}`,
      handle: `test-product-${productId}`,
      variants: [
        {
          variantId: `test-variant-${Date.now()}`,
          price: "9.99",
          sku: `TEST-SKU-${Date.now()}`,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      shopifyCreatedAt: new Date(),
      shopifyUpdatedAt: new Date(),
    });

    // Save it
    const savedProduct = await testProduct.save();

    // Verify it was saved by querying it back
    const verifiedProduct = await ProductModel.findOne({ storeId, productId });

    res.json({
      success: true,
      message: "Test product saved and verified",
      product: savedProduct,
      verified: !!verifiedProduct,
      verifiedProduct,
    });
  } catch (error) {
    logger.error("Error testing database write:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
});

// Add to src/routes/api.ts
router.get("/products/:productId", async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;

    // Find the product in database
    const product = await ProductModel.findOne({ productId });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: `Product with ID ${productId} not found`,
      });
    }

    // Enable CORS for frontend
    res.header("Access-Control-Allow-Origin", "*");

    // Return the product data
    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error(`Error fetching product ${req.params.productId}:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
