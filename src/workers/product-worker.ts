// Updated src/workers/product-worker.ts for BullMQ
import { Job } from "bullmq";
import { ShopifyAPI } from "../services/shopify-api";
import { JobTracker } from "../services/job-tracker";
import { ProductTask } from "../types";
import logger from "../utils/logger";

export class WorkerService {
  static async processProduct(job: Job<ProductTask>): Promise<any> {
    const { productId, action, jobId, shopCredentials, ...actionData } =
      job.data;

    try {
      logger.debug(`Processing product ${productId} with action ${action}`);

      // Update status to processing
      await JobTracker.updateProductStatus(jobId, productId, "processing");

      const shopify = new ShopifyAPI(shopCredentials);
      const product = await shopify.getProduct(productId);

      // Apply the requested action
      let result;
      switch (action) {
        case "getProduct":
          result = await shopify.getProduct(productId);
          break;
        case "updateTags":
          result = await shopify.updateProductTags(product, actionData.tags);
          break;
        case "updateInventory":
          result = await shopify.updateInventory(product, actionData.inventory);
          break;
        case "updatePrice":
          result = await shopify.updatePrice(product, actionData.price);
          break;
        case "updateMetafield":
          result = await shopify.updateMetafield(
            product,
            actionData.namespace,
            actionData.key,
            actionData.value,
            actionData.type
          );
          break;
        // Add more actions as needed
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      // Update job status with result
      logger.info(
        `Successfully processed product ${productId} with action ${action}`
      );
      await JobTracker.updateProductStatus(
        jobId,
        productId,
        "completed",
        result
      );

      return result; // Return result so it can be used in the 'completed' event
    } catch (error) {
      logger.error(`Error processing product ${productId}:`, error);
      await JobTracker.updateProductStatus(
        jobId,
        productId,
        "failed",
        error.message
      );
      throw error; // Re-throw to trigger the queue's retry mechanism
    }
  }
}
