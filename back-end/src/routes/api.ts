// src/routes/integration-jobs.ts
import express, { Request, Response, NextFunction } from "express";
import { IntegrationJobService } from "../services/IntegrationJobService";
import { IntegrationJob } from "../models/IntegrationJob";
import { JobExecution } from "../models/JobExecution";
import logger from "../utils/logger";

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

// Create a new integration job
router.post(
  "/jobs",
  validateShopifyCredentials,
  async (req: Request, res: Response) => {
    try {
      const jobData = {
        name: req.body.name,
        description: req.body.description,
        sourceType: req.body.sourceType || "shopify",
        destinationType: req.body.destinationType || "mongodb",
        configuration: {
          // Include credentials from headers
          shopName: (req as any).shopifyCredentials.shopName,
          accessToken: (req as any).shopifyCredentials.accessToken,

          // For compatibility with existing code that expects credentials in a nested object
          shopify: {
            shopName: (req as any).shopifyCredentials.shopName,
            accessToken: (req as any).shopifyCredentials.accessToken,
          },

          // Include other configuration from request body
          ...req.body.configuration,
        },
        enabled: req.body.enabled !== false,
        schedule: req.body.schedule,
        createdBy: req.body.createdBy,
      };

      const job = await IntegrationJobService.createJob(jobData);

      res.status(201).json({
        success: true,
        data: job,
      });
    } catch (error) {
      logger.error("Error creating integration job:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Get all integration jobs
router.get("/jobs", async (req: Request, res: Response) => {
  try {
    // Extract query parameters for filtering
    const sourceType = req.query.sourceType as string;
    const destinationType = req.query.destinationType as string;
    const enabled =
      req.query.enabled !== undefined
        ? req.query.enabled === "true"
        : undefined;

    // Build filter object
    const filters: any = {};
    if (sourceType) filters.sourceType = sourceType;
    if (destinationType) filters.destinationType = destinationType;
    if (enabled !== undefined) filters.enabled = enabled;

    const jobs = await IntegrationJobService.listJobs(filters);

    res.json({
      success: true,
      data: jobs,
    });
  } catch (error) {
    logger.error("Error listing integration jobs:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Get a specific integration job
router.get("/jobs/:jobId", async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await IntegrationJobService.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: `Integration job with ID ${jobId} not found`,
      });
    }

    res.json({
      success: true,
      data: job,
    });
  } catch (error) {
    logger.error(`Error getting integration job ${req.params.jobId}:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Update an integration job
router.put(
  "/jobs/:jobId",
  validateShopifyCredentials,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      // Prepare updates
      const updates: any = {};

      // Update basic fields if provided
      if (req.body.name) updates.name = req.body.name;
      if (req.body.description !== undefined)
        updates.description = req.body.description;
      if (req.body.enabled !== undefined) updates.enabled = req.body.enabled;
      if (req.body.schedule) updates.schedule = req.body.schedule;

      // Update configuration if provided
      if (req.body.configuration) {
        // Get existing job to merge configurations properly
        const existingJob = await IntegrationJobService.getJob(jobId);

        if (!existingJob) {
          return res.status(404).json({
            success: false,
            error: `Integration job with ID ${jobId} not found`,
          });
        }

        // Create a new configuration by merging existing with updates
        const existingConfig = existingJob.configuration.toObject();
        updates.configuration = {
          ...existingConfig,
          ...req.body.configuration,
          // Always keep the credentials from headers
          shopName: (req as any).shopifyCredentials.shopName,
          accessToken: (req as any).shopifyCredentials.accessToken,

          // Also maintain nested shopify credentials for compatibility
          shopify: {
            ...existingConfig.shopify,
            shopName: (req as any).shopifyCredentials.shopName,
            accessToken: (req as any).shopifyCredentials.accessToken,
          },
        };
      }

      // Update the job
      const updatedJob = await IntegrationJobService.updateJob(jobId, updates);

      if (!updatedJob) {
        return res.status(404).json({
          success: false,
          error: `Integration job with ID ${jobId} not found`,
        });
      }

      res.json({
        success: true,
        data: updatedJob,
      });
    } catch (error) {
      logger.error(
        `Error updating integration job ${req.params.jobId}:`,
        error
      );
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Delete an integration job
router.delete("/jobs/:jobId", async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const success = await IntegrationJobService.deleteJob(jobId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: `Integration job with ID ${jobId} not found`,
      });
    }

    res.json({
      success: true,
      message: `Integration job ${jobId} deleted successfully`,
    });
  } catch (error) {
    logger.error(`Error deleting integration job ${req.params.jobId}:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Create a new execution for a job
router.post("/jobs/:jobId/executions", async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const syncType = req.body.syncType || "incremental";

    const execution = await IntegrationJobService.createExecution(jobId, {
      syncType,
      createdBy: req.body.createdBy,
      metadata: req.body.metadata,
    });

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: `Integration job with ID ${jobId} not found or disabled`,
      });
    }

    // Start the worker to process the job
    IntegrationJobService.startWorker();

    res.status(201).json({
      success: true,
      data: execution,
    });
  } catch (error) {
    logger.error(
      `Error creating execution for job ${req.params.jobId}:`,
      error
    );
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Get all executions for a job
router.get("/jobs/:jobId/executions", async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const limit = parseInt((req.query.limit as string) || "10");
    const page = parseInt((req.query.page as string) || "1");
    const status = req.query.status as string;

    const skip = (page - 1) * limit;

    const { executions, total } = await IntegrationJobService.getJobExecutions(
      jobId,
      {
        limit,
        skip,
        status,
      }
    );

    res.json({
      success: true,
      data: {
        executions,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error(
      `Error getting executions for job ${req.params.jobId}:`,
      error
    );
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Get a specific execution
router.get("/executions/:executionId", async (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;
    const execution = await IntegrationJobService.getExecution(executionId);

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: `Execution with ID ${executionId} not found`,
      });
    }

    res.json({
      success: true,
      data: execution,
    });
  } catch (error) {
    logger.error(`Error getting execution ${req.params.executionId}:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Cancel an execution
router.post(
  "/executions/:executionId/cancel",
  async (req: Request, res: Response) => {
    try {
      const { executionId } = req.params;
      const success = await IntegrationJobService.cancelExecution(executionId);

      if (!success) {
        return res.status(400).json({
          success: false,
          error: `Execution ${executionId} not found or cannot be cancelled`,
        });
      }

      res.json({
        success: true,
        message: `Execution ${executionId} cancelled successfully`,
      });
    } catch (error) {
      logger.error(
        `Error cancelling execution ${req.params.executionId}:`,
        error
      );
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// API endpoint to trigger scheduler manually
router.post("/scheduler/run", async (req: Request, res: Response) => {
  try {
    const scheduledCount = await IntegrationJobService.processScheduledJobs();

    res.json({
      success: true,
      message: `Scheduled ${scheduledCount} jobs for execution`,
    });
  } catch (error) {
    logger.error("Error running scheduler:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
