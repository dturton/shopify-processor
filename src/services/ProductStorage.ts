// src/services/ProductStorage.ts
import { ProductModel, IProduct } from "../models/product";
import { Checkpoint, ICheckpoint } from "../models/Checkpoint";
import logger from "../utils/logger";

/**
 * Service for storing and managing Shopify products in MongoDB
 * Implements stream processing with checkpoint-based recovery
 */
export class ProductStorage {
  private storeId: string;
  private batchSize: number;

  /**
   * @param storeId Unique identifier for the store
   * @param batchSize Number of products to process in each database batch
   */
  constructor(storeId: string, batchSize: number = 50) {
    this.storeId = storeId;
    this.batchSize = batchSize;
  }

  /**
   * Process a collection of products from Shopify with batch processing
   * Returns stats and the list of processed product IDs for cleanup
   */
  async storeProductsInBatches(products: any[]): Promise<{
    stats: { created: number; updated: number; failed: number };
    processedIds: string[];
  }> {
    const stats = {
      created: 0,
      updated: 0,
      failed: 0,
    };

    const processedProductIds: string[] = [];

    // Process products in batches
    for (let i = 0; i < products.length; i += this.batchSize) {
      const batch = products.slice(i, i + this.batchSize);
      logger.info(
        `Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(
          products.length / this.batchSize
        )}`
      );

      const batchStats = await this.processBatch(batch);

      // Accumulate stats
      stats.created += batchStats.created;
      stats.updated += batchStats.updated;
      stats.failed += batchStats.failed;

      // Track processed IDs
      processedProductIds.push(
        ...batch
          .filter((_, index) => !batchStats.failedIndices.includes(index))
          .map((product) => product.id)
      );

      logger.info(`Batch stats: ${JSON.stringify(batchStats)}`);
    }

    return {
      stats,
      processedIds: processedProductIds,
    };
  }

  /**
   * Process a single batch of products
   */
  private async processBatch(products: any[]): Promise<{
    created: number;
    updated: number;
    failed: number;
    failedIndices: number[];
  }> {
    const stats = {
      created: 0,
      updated: 0,
      failed: 0,
      failedIndices: [] as number[],
    };

    const operations = [];
    const now = new Date();

    // Prepare all operations for the batch
    for (let i = 0; i < products.length; i++) {
      try {
        const shopifyProduct = products[i];
        const transformedProduct = this.transformProduct(shopifyProduct);

        // Create the upsert operation
        operations.push({
          updateOne: {
            filter: {
              storeId: this.storeId,
              productId: transformedProduct.productId,
            },
            update: {
              $set: {
                ...transformedProduct,
                updatedAt: now,
              },
              $setOnInsert: {
                createdAt: now,
              },
            },
            upsert: true,
          },
        });
      } catch (error) {
        logger.error(`Failed to transform product at index ${i}:`, error);
        stats.failed++;
        stats.failedIndices.push(i);
      }
    }

    // Execute the batch operation if there are any valid operations
    if (operations.length > 0) {
      try {
        const result = await ProductModel.bulkWrite(operations, {
          ordered: false,
        });

        // Update stats based on the operation result
        stats.created = result.upsertedCount || 0;
        stats.updated =
          (result.modifiedCount || 0) +
          (result.matchedCount || 0) -
          stats.created;
      } catch (error) {
        // Handle partial failures in bulkWrite
        if (error.writeErrors) {
          const failedCount = error.writeErrors.length;
          stats.failed += failedCount;

          // Get indices of failed operations from the error object
          for (const writeError of error.writeErrors) {
            const index = writeError.index;
            stats.failedIndices.push(index);
          }

          // If we have some successes, calculate them
          if (error.result) {
            stats.created = error.result.upsertedCount || 0;
            stats.updated =
              (error.result.modifiedCount || 0) +
              (error.result.matchedCount || 0) -
              stats.created;
          }
        } else {
          // Complete failure of the batch
          logger.error(`Batch operation failed completely:`, error);
          stats.failed = products.length - stats.failedIndices.length;
          for (let i = 0; i < products.length; i++) {
            if (!stats.failedIndices.includes(i)) {
              stats.failedIndices.push(i);
            }
          }
        }
      }
    }

    return stats;
  }

  /**
   * Transform a Shopify product to our database model format
   */
  private transformProduct(shopifyProduct: any): Partial<IProduct> {
    // Transform variants
    const variants = shopifyProduct.variants.map((variant: any) => ({
      variantId: variant.id,
      price: variant.price,
      sku: variant.sku,
      compareAtPrice: variant.compare_at_price,
      inventoryQuantity: variant.inventory_quantity,
      inventoryItemId: variant.inventory_item_id,
    }));

    // Return transformed product
    return {
      storeId: this.storeId,
      productId: shopifyProduct.id,
      title: shopifyProduct.title,
      description: shopifyProduct.description,
      handle: shopifyProduct.handle,
      productType: shopifyProduct.product_type,
      vendor: shopifyProduct.vendor,
      tags: shopifyProduct.tags,
      variants,
      shopifyCreatedAt: new Date(shopifyProduct.created_at),
      shopifyUpdatedAt: new Date(shopifyProduct.updated_at),
    };
  }

  /**
   * Delete products that are no longer present in Shopify
   * Should be called after a full sync to remove deleted products
   */
  async cleanupDeletedProducts(syncedProductIds: string[]): Promise<number> {
    try {
      // Find all products that were not in the synced batch
      const result = await ProductModel.deleteMany({
        storeId: this.storeId,
        productId: { $nin: syncedProductIds },
      });

      return result.deletedCount || 0;
    } catch (error) {
      logger.error("Failed to cleanup deleted products:", error);
      throw error;
    }
  }

  /**
   * Get all product IDs for a store
   */
  async getAllProductIds(): Promise<string[]> {
    const products = await ProductModel.find(
      { storeId: this.storeId },
      { productId: 1, _id: 0 }
    );

    return products.map((p) => p.productId);
  }

  /**
   * Save sync checkpoint to allow resuming from a specific point
   */
  async saveCheckpoint(
    jobId: string,
    lastProcessedId: string,
    processingStage: string,
    metadata: { [key: string]: any } = {}
  ): Promise<ICheckpoint> {
    try {
      // Create a new checkpoint document
      const checkpoint = new Checkpoint({
        jobId,
        lastProcessedId,
        processingStage,
        timestamp: new Date(),
        metadata,
      });

      // Save the checkpoint
      await checkpoint.save();

      logger.debug(
        `Saved checkpoint for job ${jobId}, stage: ${processingStage}, ID: ${lastProcessedId}`
      );

      return checkpoint;
    } catch (error) {
      logger.error(`Failed to save checkpoint for job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve the latest checkpoint for a job
   */
  async getCheckpoint(jobId: string): Promise<{
    lastProcessedId: string;
    processingStage: string;
    metadata: { [key: string]: any };
  } | null> {
    try {
      // Find the most recent checkpoint for this job
      const checkpoint = await Checkpoint.findOne({ jobId })
        .sort({ timestamp: -1 })
        .limit(1);

      if (!checkpoint) {
        logger.debug(`No checkpoint found for job ${jobId}`);
        return null;
      }

      logger.info(
        `Retrieved checkpoint for job ${jobId}: ${checkpoint.processingStage}, ID: ${checkpoint.lastProcessedId}`
      );

      return {
        lastProcessedId: checkpoint.lastProcessedId,
        processingStage: checkpoint.processingStage,
        metadata: checkpoint.metadata.toObject() || {},
      };
    } catch (error) {
      logger.error(`Failed to retrieve checkpoint for job ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Get all checkpoints for a job
   * Useful for debugging and monitoring
   */
  async getAllCheckpoints(jobId: string): Promise<ICheckpoint[]> {
    try {
      // Find all checkpoints for this job, sorted by timestamp
      const checkpoints = await Checkpoint.find({ jobId }).sort({
        timestamp: -1,
      });

      return checkpoints;
    } catch (error) {
      logger.error(`Failed to retrieve checkpoints for job ${jobId}:`, error);
      return [];
    }
  }

  /**
   * Delete all checkpoints for a job
   * Usually called after successful completion
   */
  async clearCheckpoints(jobId: string): Promise<number> {
    try {
      const result = await Checkpoint.deleteMany({ jobId });
      logger.debug(
        `Cleared ${result.deletedCount} checkpoints for job ${jobId}`
      );
      return result.deletedCount || 0;
    } catch (error) {
      logger.error(`Failed to clear checkpoints for job ${jobId}:`, error);
      return 0;
    }
  }

  /**
   * Find products that need updating based on Shopify updated_at timestamp
   * Useful for determining what needs to be synced without fetching everything
   */
  async findProductsToUpdate(lastSyncTime: Date): Promise<number> {
    try {
      // Count products that have been updated in Shopify since the last sync
      const count = await ProductModel.countDocuments({
        storeId: this.storeId,
        shopifyUpdatedAt: { $gt: lastSyncTime },
      });

      return count;
    } catch (error) {
      logger.error(
        `Failed to count products updated since ${lastSyncTime}:`,
        error
      );
      return 0;
    }
  }

  /**
   * Get product statistics for the store
   */
  async getProductStats(): Promise<{
    totalProducts: number;
    byVendor: { [vendor: string]: number };
    byProductType: { [productType: string]: number };
  }> {
    try {
      // Get total count
      const totalProducts = await ProductModel.countDocuments({
        storeId: this.storeId,
      });

      // Count by vendor
      const vendorCounts = await ProductModel.aggregate([
        { $match: { storeId: this.storeId } },
        { $group: { _id: "$vendor", count: { $sum: 1 } } },
      ]);

      // Count by product type
      const productTypeCounts = await ProductModel.aggregate([
        { $match: { storeId: this.storeId } },
        { $group: { _id: "$productType", count: { $sum: 1 } } },
      ]);

      // Format the results
      const byVendor: { [vendor: string]: number } = {};
      vendorCounts.forEach((item) => {
        byVendor[item._id || "Unknown"] = item.count;
      });

      const byProductType: { [productType: string]: number } = {};
      productTypeCounts.forEach((item) => {
        byProductType[item._id || "Unknown"] = item.count;
      });

      return {
        totalProducts,
        byVendor,
        byProductType,
      };
    } catch (error) {
      logger.error(`Failed to get product stats:`, error);
      return {
        totalProducts: 0,
        byVendor: {},
        byProductType: {},
      };
    }
  }
}
