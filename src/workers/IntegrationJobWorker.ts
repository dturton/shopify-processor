// src/workers/IntegrationJobWorker.ts
import { JobState } from "../models/JobState";
import { SyncContextImpl } from "../services/SyncContextImpl";
import { ProductStorage } from "../services/ProductStorage";
import logger from "../utils/logger";
import shopify from "../connectors/sources/shopify";

/**
 * Integration Job Worker that manages job state transitions
 * Now supports stream processing through the connectors
 */
export class IntegrationJobWorker {
  private jobId: string;
  private job: any = null;
  private storeId: string = "default-store";

  constructor(jobId: string) {
    this.jobId = jobId;
  }

  /**
   * Initialize the worker by loading the job
   */
  async initialize(): Promise<boolean> {
    try {
      // Find the job by ID
      this.job = await JobState.findOne({ jobId: this.jobId });

      if (!this.job) {
        logger.error(`Job with ID ${this.jobId} not found`);
        return false;
      }

      // Get configuration
      const config = this.getConnectorConfig();
      this.storeId = config.shopName || "default-store";

      return true;
    } catch (error) {
      logger.error(`Error initializing job ${this.jobId}:`, error);
      return false;
    }
  }

  /**
   * Process the job with proper state transitions
   * Now fully delegates processing to the connector with regular progress updates
   */
  async process(): Promise<boolean> {
    if (!this.job) {
      throw new Error("Worker not initialized. Call initialize() first.");
    }

    try {
      // Set job status to RUNNING
      await this.updateJobState({ status: "RUNNING" });

      // Get connector options and add jobId for checkpointing
      const config = this.getConnectorConfig();
      config.jobId = this.jobId; // Add jobId to config

      // Create a SyncContext for this job
      const syncContext = new SyncContextImpl(config);

      // Execute the connector's fetchData function with the SyncContext
      // The connector now handles all processing including saving products
      await shopify(syncContext);

      // Get metrics from the sync context
      const metrics = syncContext.getMetrics();

      // Get processed product IDs from metadata (if set by connector)
      const processedProductIds = metrics.metadata?.processedProductIds || [];

      // Determine if this was a full sync (no lastSyncTime)
      const isFullSync = !this.job.lastSyncTime;

      // For full syncs, if the connector didn't handle cleanup, handle it here
      if (
        isFullSync &&
        this.job.sourceType.toLowerCase() === "shopify" &&
        processedProductIds.length > 0 &&
        !metrics.metadata?.cleanupPerformed
      ) {
        try {
          const productStorage = new ProductStorage(this.storeId);
          const deletedCount = await productStorage.cleanupDeletedProducts(
            processedProductIds
          );
          logger.info(
            `Cleaned up ${deletedCount} deleted products during post-processing`
          );
        } catch (error) {
          logger.error(
            "Error cleaning up deleted products during post-processing:",
            error
          );
          // Don't throw here - we don't want to fail the job if cleanup fails
        }
      }

      // Update job state with the metrics and set lastSyncTime to current time
      await this.updateJobState({
        status: "COMPLETED",
        totalRecords: metrics.totalRecords,
        recordsSucceeded: metrics.recordsSucceeded,
        recordsFailed: metrics.recordsFailed,
        progress: 100, // Ensure we set to 100% on completion
        lastSyncTime: new Date(), // Set lastSyncTime to current time upon successful completion
      });

      return true;
    } catch (error) {
      logger.error(`Error processing job ${this.jobId}:`, error);

      // Update job state to reflect the failure but preserve progress
      const syncContext = new SyncContextImpl(this.getConnectorConfig());
      const metrics = syncContext.getMetrics();

      // Set job status to FAILED but don't update lastSyncTime
      await this.updateJobState({
        status: "FAILED",
        // Don't change lastSyncTime on failure
        // Preserve any progress metrics that were updated
        ...(metrics.progress > 0 ? { progress: metrics.progress } : {}),
        ...(metrics.recordsSucceeded > 0
          ? { recordsSucceeded: metrics.recordsSucceeded }
          : {}),
        ...(metrics.recordsFailed > 0
          ? { recordsFailed: metrics.recordsFailed }
          : {}),
        ...(metrics.totalRecords > 0
          ? { totalRecords: metrics.totalRecords }
          : {}),
      });

      return false;
    }
  }

  /**
   * Update job state
   */
  private async updateJobState(updates: any): Promise<void> {
    try {
      await JobState.findByIdAndUpdate(this.job._id, updates);

      // Update local job object
      Object.assign(this.job, updates);

      logger.info(
        `Job ${this.jobId} state updated: ${JSON.stringify(updates)}`
      );
    } catch (error) {
      logger.error(`Error updating state for job ${this.jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get connector configuration combining job config and environment variables
   */
  private getConnectorConfig(): any {
    const sourceType = this.job.sourceType.toUpperCase();

    // Combine default options with job-specific options
    return {
      // Default options
      batchSize: 250,
      detailBatchSize: 10,
      storeBatchSize: 50,

      // Job-specific options
      ...this.job.options,

      // Add lastSyncTime to the config for incremental sync
      lastSyncTime: this.job.lastSyncTime,

      // Source-specific credentials from environment variables
      shopName: process.env.SHOPIFY_HOST,
      accessToken: process.env.SHOPIFY_ACCESS_KEY,
    };
  }
}
