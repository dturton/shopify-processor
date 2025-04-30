import { Queue, Worker, QueueEvents } from "bullmq";
import config from "../config";
import { JobTracker } from "./job-tracker";
import { ProductTask } from "../types";

import logger from "../utils/logger";

// Redis connection options
const redisOptions = {
  host: config.redis.host,
  port: config.redis.port,
};

export class QueueService {
  private static productQueue = new Queue<ProductTask>("product-processing", {
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

  private static worker: Worker<ProductTask>;
  private static queueEvents: QueueEvents;

  static async addTask(task: ProductTask): Promise<void> {
    await this.productQueue.add(task.action, task);
    await JobTracker.updateProductStatus(task.jobId, task.productId, "queued");
  }

  static async addBatch(tasks: ProductTask[]): Promise<void> {
    // BullMQ supports bulk add operations
    const bulkJobs = tasks.map((task) => ({
      name: task.action,
      data: task,
    }));

    await this.productQueue.addBulk(bulkJobs);

    // Update all tasks as queued
    const statusUpdates = tasks.map((task) =>
      JobTracker.updateProductStatus(task.jobId, task.productId, "queued")
    );
    await Promise.all(statusUpdates);
  }

  static initialize(processCallback: (job: any) => Promise<void>): void {
    // Create a worker to process jobs
    this.worker = new Worker<ProductTask>(
      "product-processing",
      processCallback,
      {
        connection: redisOptions,
        autorun: true,
        concurrency: 10, // Adjust based on your needs
      }
    );

    // Create queue events instance to listen for job events
    this.queueEvents = new QueueEvents("product-processing", {
      connection: redisOptions,
    });

    // Set up event listeners
    this.queueEvents.on("completed", async ({ jobId, returnvalue }) => {
      const job = await this.productQueue.getJob(jobId);
      if (job) {
        logger.info(`Job completed: ${jobId}`, {
          productId: job.data.productId,
          jobId: job.data.jobId,
        });
        await JobTracker.updateProductStatus(
          job.data.jobId,
          job.data.productId,
          "completed"
        );
      }
    });

    this.queueEvents.on("failed", async ({ jobId, failedReason }) => {
      const job = await this.productQueue.getJob(jobId);
      if (job) {
        logger.error("Job failed", {
          productId: job.data.productId,
          jobId: job.data.jobId,
          error: failedReason,
        });
        await JobTracker.updateProductStatus(
          job.data.jobId,
          job.data.productId,
          "failed",
          failedReason
        );
      }
    });

    this.worker.on("stalled", async (jobId) => {
      const job = await this.productQueue.getJob(jobId);
      if (job) {
        logger.warn("Job stalled", {
          productId: job.data.productId,
          jobId: job.data.jobId,
        });
      }
    });

    logger.info("Queue service initialized with BullMQ");
  }

  static async getQueueStats(): Promise<any> {
    const [
      activeCount,
      completedCount,
      failedCount,
      delayedCount,
      waitingCount,
    ] = await Promise.all([
      this.productQueue.getActiveCount(),
      this.productQueue.getCompletedCount(),
      this.productQueue.getFailedCount(),
      this.productQueue.getDelayedCount(),
      this.productQueue.getWaitingCount(),
    ]);

    return {
      active: activeCount,
      completed: completedCount,
      failed: failedCount,
      delayed: delayedCount,
      waiting: waitingCount,
    };
  }

  static async clearQueue(): Promise<void> {
    await this.productQueue.obliterate({ force: true });
    logger.info("Queue cleared");
  }

  static async pauseQueue(): Promise<void> {
    await this.productQueue.pause();
    logger.info("Queue paused");
  }

  static async resumeQueue(): Promise<void> {
    await this.productQueue.resume();
    logger.info("Queue resumed");
  }

  static async closeQueue(): Promise<void> {
    // Properly close connections when shutting down
    await this.worker.close();
    await this.queueEvents.close();
    await this.productQueue.close();
    logger.info("Queue connections closed");
  }
}
