import { Queue, Worker, Job } from "bullmq";
import { JobState, IJobState } from "../models/JobState";
import { IntegrationJobWorker } from "../workers/IntegrationJobWorker";
import logger from "../utils/logger";

// Connection configuration for Redis
const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
};

// Define the queue
const integrationQueue = new Queue("integrations", { connection });

/**
 * Integration Job Processor that works with BullMQ
 * Includes support for incremental syncs and job resumption
 */
export class IntegrationJobProcessor {
  /**
   * Create a new job in BullMQ and MongoDB
   */
  static async createJob(
    sourceType: string,
    destinationType: string,
    options: any = {}
  ) {
    const jobId = `job-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    logger.info(
      `Creating new job: ${jobId}, type: ${sourceType} to ${destinationType}`
    );

    // Create the initial job state
    const state = new JobState({
      jobId,
      sourceType,
      destinationType,
      status: "CREATED",
      totalRecords: 0,
      recordsSucceeded: 0,
      recordsFailed: 0,
      progress: 0,
      lastSyncTime: null, // Initial sync has no lastSyncTime
    });
    const savedState = await state.save();

    // Then add to BullMQ queue
    const job = await integrationQueue.add(
      "process-integration",
      { ...savedState.toObject() },
      { ...options }
    );

    logger.info(`Job ${jobId} created and added to queue`);

    return job;
  }

  /**
   * Create an incremental sync job based on a previous job
   * This will use the lastSyncTime from the most recent successful job
   */
  static async createIncrementalJob(
    sourceType: string,
    destinationType: string,
    options: any = {}
  ) {
    logger.info(
      `Creating incremental job for ${sourceType} to ${destinationType}`
    );

    // Find the most recent successful job for this source/destination combination
    const previousJob = await JobState.findOne({
      sourceType,
      destinationType,
      status: "COMPLETED",
      lastSyncTime: { $ne: null },
    }).sort({ lastSyncTime: -1 });

    const jobId = `job-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    // Create a new job with the lastSyncTime from the previous job if available
    const state = new JobState({
      jobId,
      sourceType,
      destinationType,
      status: "CREATED",
      totalRecords: 0,
      recordsSucceeded: 0,
      recordsFailed: 0,
      progress: 0,
      lastSyncTime: previousJob ? previousJob.lastSyncTime : null,
    });
    await state.save();

    // Add to BullMQ queue
    const job = await integrationQueue.add(
      "process-integration",
      { jobId },
      {
        jobId,
        ...options,
      }
    );

    if (previousJob) {
      logger.info(
        `Created incremental job ${jobId} with lastSyncTime: ${previousJob.lastSyncTime}`
      );
    } else {
      logger.info(
        `No previous successful job found, created full sync job ${jobId}`
      );
    }

    return {
      job,
      isIncremental: !!previousJob,
      previousSyncTime: previousJob ? previousJob.lastSyncTime : null,
    };
  }

  /**
   * Resume a failed job
   */
  static async resumeJob(jobId: string, options: any = {}) {
    logger.info(`Resuming job ${jobId}`);

    // Check if the job exists
    const jobState = await JobState.findOne({ jobId });

    if (!jobState) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (jobState.status !== "CREATED") {
      logger.warn(
        `Resuming job ${jobId} with status ${jobState.status}, expected CREATED`
      );
    }

    // Add the job back to the queue
    const job = await integrationQueue.add(
      "process-integration",
      { jobId },
      {
        jobId,
        ...options,
      }
    );

    logger.info(`Job ${jobId} resumed and added to queue`);

    return job;
  }

  /**
   * Get information about the latest successful sync
   */
  static async getLatestSyncInfo(sourceType: string, destinationType: string) {
    const latestJob = await JobState.findOne({
      sourceType,
      destinationType,
      status: "COMPLETED",
    }).sort({ updatedAt: -1 });

    if (!latestJob) {
      return {
        hasCompletedSync: false,
        lastSyncTime: null,
      };
    }

    return {
      hasCompletedSync: true,
      lastSyncTime: latestJob.lastSyncTime,
      jobId: latestJob.jobId,
      recordsProcessed: latestJob.recordsSucceeded,
      completedAt: latestJob.updatedAt,
    };
  }

  /**
   * Get job sync statistics for monitoring and reporting
   */
  static async getJobStats(jobId: string) {
    const job = await JobState.findOne({ jobId });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    return {
      jobId: job.jobId,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      totalRecords: job.totalRecords,
      recordsSucceeded: job.recordsSucceeded,
      recordsFailed: job.recordsFailed,
      progress: job.progress,
      sourceType: job.sourceType,
      destinationType: job.destinationType,
      lastSyncTime: job.lastSyncTime,
      duration:
        job.status === "COMPLETED"
          ? job.updatedAt.getTime() - job.createdAt.getTime()
          : null,
    };
  }

  /**
   * Prune old job records to prevent database growth
   * Keeps recent and important jobs while removing older ones
   */
  static async pruneOldJobs(daysToKeep: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    // Always keep the most recent successful job regardless of age (for lastSyncTime)
    const latestSuccessfulJobs = await JobState.find({
      status: "COMPLETED",
    })
      .sort({ updatedAt: -1 })
      .limit(1)
      .select("_id");

    const idsToKeep = latestSuccessfulJobs.map((job) => job._id);

    // Delete old jobs except for the IDs to keep
    const result = await JobState.deleteMany({
      _id: { $nin: idsToKeep },
      updatedAt: { $lt: cutoffDate },
    });

    logger.info(
      `Pruned ${result.deletedCount} old jobs older than ${daysToKeep} days`
    );

    return result.deletedCount;
  }

  /**
   * Start the worker to process jobs
   */
  static startWorker() {
    const worker = new Worker(
      "integrations",
      async (job: Job) => {
        const { jobId } = job.data;
        const jobWorker = new IntegrationJobWorker(jobId);

        try {
          logger.info(`Initializing job worker for job ${jobId}`);
          const initialized = await jobWorker.initialize();
          if (!initialized) {
            throw new Error(`Failed to initialize job ${jobId}`);
          }

          logger.info(`Processing job ${jobId}`);
          await jobWorker.process();
          logger.info(`Job ${jobId} processed successfully`);

          return { success: true };
        } catch (error) {
          logger.error(`Job ${jobId} failed:`, error);
          throw error;
        }
      },
      { connection }
    );

    worker.on("completed", (job) => {
      logger.info(`Job ${job.id} completed successfully`);
    });

    worker.on("failed", (job, error) => {
      logger.error(`Job ${job.id} failed:`, error);
    });

    // Add other event handlers
    worker.on("stalled", (jobId) => {
      logger.warn(`Job ${jobId} stalled`);
    });

    worker.on("error", (error) => {
      logger.error(`Worker error:`, error);
    });

    return worker;
  }
}

export default IntegrationJobProcessor;
export { integrationQueue };
