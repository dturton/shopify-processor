// src/services/IntegrationJobService.ts
import { Queue, Worker, Job } from "bullmq";
import { IntegrationJob, IIntegrationJob } from "../models/IntegrationJob";
import { JobExecution, IJobExecution } from "../models/JobExecution";
import { SyncContextImpl } from "../services/SyncContextImpl";
import { ProductStorage } from "../services/ProductStorage";
import shopify from "../connectors/sources/shopify";
import logger from "../utils/logger";
import config from "../config";

// Connection configuration for Redis
const connection = {
  host: config.redis.host || "localhost",
  port: parseInt(config.redis.port?.toString() || "6379"),
};

// Define the queue
const integrationQueue = new Queue("integrations", { connection });

/**
 * Service for managing IntegrationJobs and JobExecutions
 */
export class IntegrationJobService {
  /**
   * Create a new integration job
   */
  static async createJob(
    jobData: Partial<IIntegrationJob>
  ): Promise<IIntegrationJob> {
    try {
      // Create the job with the provided data
      const job = new IntegrationJob({
        ...jobData,
        enabled: jobData.enabled ?? true,
      });

      await job.save();
      logger.info(`Created new integration job: ${job._id} (${job.name})`);

      return job;
    } catch (error) {
      logger.error(`Error creating integration job:`, error);
      throw error;
    }
  }

  /**
   * Update an existing integration job
   */
  static async updateJob(
    jobId: string,
    updates: Partial<IIntegrationJob>
  ): Promise<IIntegrationJob | null> {
    try {
      // Find and update the job
      const job = await IntegrationJob.findByIdAndUpdate(
        jobId,
        { $set: updates },
        { new: true }
      );

      if (!job) {
        logger.warn(`Integration job ${jobId} not found for update`);
        return null;
      }

      logger.info(`Updated integration job: ${job._id} (${job.name})`);
      return job;
    } catch (error) {
      logger.error(`Error updating integration job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get a job by ID
   */
  static async getJob(jobId: string): Promise<IIntegrationJob | null> {
    try {
      return await IntegrationJob.findById(jobId);
    } catch (error) {
      logger.error(`Error getting integration job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * List all jobs with optional filtering
   */
  static async listJobs(
    filters: any = {},
    sort: any = { updatedAt: -1 }
  ): Promise<IIntegrationJob[]> {
    try {
      return await IntegrationJob.find(filters).sort(sort);
    } catch (error) {
      logger.error(`Error listing integration jobs:`, error);
      throw error;
    }
  }

  /**
   * Delete a job
   */
  static async deleteJob(jobId: string): Promise<boolean> {
    try {
      const result = await IntegrationJob.findByIdAndDelete(jobId);

      if (!result) {
        logger.warn(`Integration job ${jobId} not found for deletion`);
        return false;
      }

      // Optionally, you can also delete all associated executions
      await JobExecution.deleteMany({ jobId });

      logger.info(`Deleted integration job: ${jobId}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting integration job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Create and queue a new execution for a job
   */
  static async createExecution(
    jobId: string,
    options: {
      syncType?: "full" | "incremental";
      createdBy?: string;
      metadata?: any;
    } = {}
  ): Promise<IJobExecution | null> {
    try {
      // Find the job
      const job = await IntegrationJob.findById(jobId);

      if (!job) {
        logger.warn(`Integration job ${jobId} not found for execution`);
        return null;
      }

      if (!job.enabled) {
        logger.warn(`Cannot execute disabled integration job ${jobId}`);
        return null;
      }

      // Determine sync type
      const syncType = options.syncType || "incremental";

      // For incremental syncs, find the last successful execution for this job
      let lastSuccessfulExecution = null;
      if (syncType === "incremental") {
        lastSuccessfulExecution = await JobExecution.findOne({
          jobId: job._id,
          status: "COMPLETED",
          syncType: { $in: ["full", "incremental"] }, // Consider both full and incremental syncs
        }).sort({ endTime: -1 });
      }

      // Create a new execution
      const execution = new JobExecution({
        jobId: job._id,
        status: "PENDING",
        syncType,
        createdBy: options.createdBy,
        metadata: options.metadata || {},
        // Add the cursor from last execution for resuming incremental sync
        syncCursor: lastSuccessfulExecution?.syncCursor,
      });

      await execution.save();

      // Add to the queue
      await integrationQueue.add(
        "process-integration",
        { executionId: execution.executionId },
        {
          jobId: execution.executionId,
        }
      );

      logger.info(
        `Created and queued new execution ${execution.executionId} for job ${job._id}`
      );

      // Update the job's lastExecutionId
      await IntegrationJob.findByIdAndUpdate(job._id, {
        lastExecutionId: execution.executionId,
      });

      return execution;
    } catch (error) {
      logger.error(`Error creating execution for job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get execution by ID
   */
  static async getExecution(
    executionId: string
  ): Promise<IJobExecution | null> {
    try {
      return await JobExecution.findOne({ executionId });
    } catch (error) {
      logger.error(`Error getting execution ${executionId}:`, error);
      throw error;
    }
  }

  /**
   * Get all executions for a job
   */
  static async getJobExecutions(
    jobId: string,
    options: {
      limit?: number;
      skip?: number;
      status?: string;
    } = {}
  ): Promise<{ executions: IJobExecution[]; total: number }> {
    try {
      const query: any = { jobId };

      // Add status filter if provided
      if (options.status) {
        query.status = options.status;
      }

      // Get total count
      const total = await JobExecution.countDocuments(query);

      // Get executions with pagination
      const executions = await JobExecution.find(query)
        .sort({ startTime: -1 })
        .skip(options.skip || 0)
        .limit(options.limit || 10);

      return { executions, total };
    } catch (error) {
      logger.error(`Error getting executions for job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Cancel an execution
   */
  static async cancelExecution(executionId: string): Promise<boolean> {
    try {
      const execution = await JobExecution.findOne({ executionId });

      if (!execution) {
        logger.warn(`Execution ${executionId} not found for cancellation`);
        return false;
      }

      if (execution.status !== "PENDING" && execution.status !== "RUNNING") {
        logger.warn(
          `Cannot cancel execution ${executionId} with status ${execution.status}`
        );
        return false;
      }

      // Update the execution status
      execution.status = "CANCELLED";
      execution.endTime = new Date();
      await execution.save();

      // Try to remove from queue if still pending
      if (execution.status === "PENDING") {
        await integrationQueue.remove(executionId);
      }

      logger.info(`Cancelled execution ${executionId}`);
      return true;
    } catch (error) {
      logger.error(`Error cancelling execution ${executionId}:`, error);
      throw error;
    }
  }

  /**
   * Process an execution
   * @param executionId The ID of the execution to process
   */
  static async processExecution(executionId: string): Promise<boolean> {
    try {
      // Get the execution
      const execution = await JobExecution.findOne({ executionId });

      if (!execution) {
        logger.error(`Execution ${executionId} not found for processing`);
        return false;
      }

      // Get the associated job
      const job = await IntegrationJob.findById(execution.jobId);

      if (!job) {
        logger.error(
          `Job ${execution.jobId} not found for execution ${executionId}`
        );
        // Update execution to failed
        await JobExecution.findOneAndUpdate(
          { executionId },
          {
            status: "FAILED",
            endTime: new Date(),
            error: {
              message: `Associated job ${execution.jobId} not found`,
            },
          }
        );
        return false;
      }

      // Update execution status to RUNNING
      await JobExecution.findOneAndUpdate(
        { executionId },
        {
          status: "RUNNING",
          startTime: new Date(), // Reset start time to now
        }
      );

      // Create config for the connector
      const config = {
        // Get configuration from the job
        ...job.configuration.toObject(),

        // Add execution details
        executionId,
        jobId: job._id,
        syncType: execution.syncType,

        // Add previous cursor for incremental syncs
        lastSyncCursor: execution.syncCursor,
      };

      // Create a sync context
      const syncContext = new SyncContextImpl(config);

      try {
        // Call the appropriate connector based on source type
        if (job.sourceType.toLowerCase() === "shopify") {
          await shopify(syncContext);
        } else {
          throw new Error(`Unsupported source type: ${job.sourceType}`);
        }

        // Get metrics from sync context
        const metrics = syncContext.getMetrics();

        // Generate a new cursor for this sync
        const newSyncCursor =
          metrics.metadata?.syncCursor || new Date().toISOString();

        // Update the execution with results
        await JobExecution.findOneAndUpdate(
          { executionId },
          {
            status: "COMPLETED",
            endTime: new Date(),
            progress: 100,
            totalRecords: metrics.totalRecords,
            recordsSucceeded: metrics.recordsSucceeded,
            recordsFailed: metrics.recordsFailed,
            syncCursor: newSyncCursor,
            metadata: metrics.metadata || {},
          }
        );

        // Update the job with last successful execution
        await IntegrationJob.findByIdAndUpdate(job._id, {
          lastSuccessfulExecution: new Date(),
        });

        logger.info(`Successfully completed execution ${executionId}`);
        return true;
      } catch (error) {
        // Update execution to failed status
        await JobExecution.findOneAndUpdate(
          { executionId },
          {
            status: "FAILED",
            endTime: new Date(),
            error: {
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            },
          }
        );

        logger.error(`Error processing execution ${executionId}:`, error);
        return false;
      }
    } catch (error) {
      logger.error(`Error in processExecution for ${executionId}:`, error);
      return false;
    }
  }

  /**
   * Start the BullMQ worker to process jobs from the queue
   */
  static startWorker(): Worker {
    const worker = new Worker(
      "integrations",
      async (job: Job) => {
        const { executionId } = job.data;

        try {
          logger.info(`Processing execution ${executionId}`);
          await IntegrationJobService.processExecution(executionId);
          return { success: true };
        } catch (error) {
          logger.error(
            `Worker error processing execution ${executionId}:`,
            error
          );
          throw error;
        }
      },
      { connection }
    );

    // Add event handlers
    worker.on("completed", (job) => {
      logger.info(`Job ${job.id} completed successfully`);
    });

    worker.on("failed", (job, error) => {
      logger.error(`Job ${job?.id} failed:`, error);
    });

    worker.on("stalled", (jobId) => {
      logger.warn(`Job ${jobId} stalled`);
    });

    worker.on("error", (error) => {
      logger.error(`Worker error:`, error);
    });

    return worker;
  }

  /**
   * Check for and process scheduled jobs
   */
  static async processScheduledJobs(): Promise<number> {
    try {
      const now = new Date();

      // Find jobs that are scheduled and enabled
      const scheduledJobs = await IntegrationJob.find({
        enabled: true,
        "schedule.frequency": { $ne: "manual" },
      });

      let scheduledCount = 0;

      for (const job of scheduledJobs) {
        try {
          // Check if it's time to run this job based on frequency
          let shouldRun = false;
          const lastRun = job.schedule?.lastScheduledAt || new Date(0);

          switch (job.schedule?.frequency) {
            case "hourly":
              shouldRun = now.getTime() - lastRun.getTime() >= 60 * 60 * 1000;
              break;
            case "daily":
              shouldRun =
                now.getTime() - lastRun.getTime() >= 24 * 60 * 60 * 1000;
              break;
            case "weekly":
              shouldRun =
                now.getTime() - lastRun.getTime() >= 7 * 24 * 60 * 60 * 1000;
              break;
            case "monthly":
              // Simple approximation for monthly
              shouldRun =
                now.getTime() - lastRun.getTime() >= 30 * 24 * 60 * 60 * 1000;
              break;
          }

          if (shouldRun) {
            // Create a new execution for this job
            await IntegrationJobService.createExecution(job._id.toString(), {
              syncType: "incremental",
              createdBy: "scheduler",
              metadata: {
                scheduledAt: now,
                reason: "Scheduled execution",
              },
            });

            // Update the lastScheduledAt time
            await IntegrationJob.findByIdAndUpdate(job._id, {
              "schedule.lastScheduledAt": now,
            });

            scheduledCount++;
          }
        } catch (error) {
          logger.error(`Error scheduling job ${job._id}:`, error);
        }
      }

      logger.info(`Scheduled ${scheduledCount} jobs for execution`);
      return scheduledCount;
    } catch (error) {
      logger.error(`Error processing scheduled jobs:`, error);
      return 0;
    }
  }

  /**
   * Setup the scheduler to run periodically
   */
  static setupScheduler(intervalMinutes: number = 15): NodeJS.Timeout {
    const interval = intervalMinutes * 60 * 1000;

    logger.info(
      `Setting up job scheduler to run every ${intervalMinutes} minutes`
    );

    return setInterval(async () => {
      try {
        await IntegrationJobService.processScheduledJobs();
      } catch (error) {
        logger.error("Error in scheduler:", error);
      }
    }, interval);
  }
}

export { integrationQueue };
