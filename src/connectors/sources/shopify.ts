// src/connectors/sources/shopify.ts
import { SyncContext } from "../../types";
import { ShopifyAPI } from "../../services/shopify-api";
import { ProductModel, IProduct } from "../../models/product";
import logger from "../../utils/logger";

/**
 * Shopify connector with streaming pattern using async generator
 * Processes and saves products immediately as product IDs are fetched
 */
export default async function fetchData(
  syncContext: SyncContext
): Promise<void> {
  try {
    // Get configuration from sync context
    const config = syncContext.getConfig();
    const storeId = config.shopName || "default-store";

    // Initialize the Shopify API with credentials from config
    const shopifyAPI = new ShopifyAPI({
      shopName: config.shopName,
      accessToken: config.accessToken,
    });

    syncContext.log(
      "info",
      `Processing Shopify products for shop: ${config.shopName}`
    );

    // Configure filters for the product fetch
    const filters = config.filters || {};

    // Add lastSyncTime to filters if available (for incremental sync)
    if (config.lastSyncTime) {
      const lastSyncTimeStr = new Date(config.lastSyncTime).toISOString();
      syncContext.log(
        "info",
        `Performing incremental sync with lastSyncTime: ${lastSyncTimeStr}`
      );

      // Add updated_at filter for incremental sync
      filters.updatedAtMin = lastSyncTimeStr;
    } else {
      syncContext.log(
        "info",
        "Performing full sync (no lastSyncTime available)"
      );
    }

    // Track overall metrics
    let totalFetched = 0;
    let created = 0;
    let updated = 0;
    let failed = 0;
    const processedProductIds = [];
    const maxProductsToProcess = config.maxProducts || Infinity; // Optional limit for testing

    // Initialize total count to 0 (will update as we go)
    syncContext.recordTotalCount(0);

    // Track timing for performance reporting
    const startTime = Date.now();

    // Process product IDs in batches as they're yielded by the generator
    syncContext.log(
      "info",
      "Starting to fetch and process products using streaming pattern"
    );

    // Get the batch size for fetching product details
    const detailBatchSize = config.detailBatchSize || 10;

    // Create a generator to fetch product IDs in batches
    const productIdsGenerator = shopifyAPI.getProductIdsGenerator(
      filters,
      config.batchSize || 250
    );

    // Keep track of product IDs to fetch details for
    let productIdsToProcess: string[] = [];

    // Process each batch of product IDs as they're yielded by the generator
    for await (const productIdBatch of productIdsGenerator) {
      // Log each batch of IDs received
      syncContext.log(
        "info",
        `Received batch of ${
          productIdBatch.length
        } product IDs (total so far: ${totalFetched + productIdBatch.length})`
      );

      // Add these IDs to our processing queue
      productIdsToProcess = productIdsToProcess.concat(productIdBatch);
      totalFetched += productIdBatch.length;

      // Update the total count in sync context as we learn about more products
      syncContext.recordTotalCount(totalFetched);

      // Process product details in small batches as we collect IDs
      while (
        productIdsToProcess.length > 0 &&
        totalFetched <= maxProductsToProcess
      ) {
        // Take a batch of product IDs to process
        const currentBatch = productIdsToProcess.splice(0, detailBatchSize);

        syncContext.log(
          "info",
          `Processing batch of ${currentBatch.length} products (processed: ${processedProductIds.length}/${totalFetched})`
        );

        try {
          // Fetch detailed product information for the current batch
          const productsPromises = currentBatch.map((id) =>
            shopifyAPI.getProduct(id)
          );
          const products = await Promise.all(productsPromises);

          // Process each product immediately - write directly to database
          for (const shopifyProduct of products) {
            try {
              // Transform the Shopify product to our database model format
              const transformedProduct = transformProduct(
                shopifyProduct,
                storeId
              );

              // Create an upsert operation that directly executes
              const result = await ProductModel.updateOne(
                {
                  storeId: transformedProduct.storeId,
                  productId: transformedProduct.productId,
                },
                {
                  $set: {
                    ...transformedProduct,
                    updatedAt: new Date(),
                  },
                  $setOnInsert: {
                    createdAt: new Date(),
                  },
                },
                { upsert: true }
              );

              // Track successful write
              if (result.upsertedCount) {
                created++;
              } else {
                updated++;
              }

              // Add to processed IDs for cleanup
              processedProductIds.push(shopifyProduct.id);
            } catch (error) {
              syncContext.log(
                "error",
                `Failed to save product ${shopifyProduct.id}:`,
                error
              );
              failed++;
            }
          }

          // Update progress
          const progress = Math.round(
            (processedProductIds.length / totalFetched) * 100
          );
          syncContext.updateProgress(progress);
          syncContext.recordSuccess(currentBatch.length - failed);

          // Log detailed progress every 100 products or at the end of a batch
          if (
            processedProductIds.length % 100 === 0 ||
            productIdsToProcess.length === 0
          ) {
            const duration = (Date.now() - startTime) / 1000;
            const rate = processedProductIds.length / duration;

            syncContext.log(
              "info",
              `Progress: ${processedProductIds.length}/${totalFetched} (${progress}%) - ` +
                `Created: ${created}, Updated: ${updated}, Failed: ${failed} - ` +
                `Rate: ${rate.toFixed(
                  2
                )} products/sec - Duration: ${duration.toFixed(0)}s`
            );

            // Verify database count
            const dbCount = await ProductModel.countDocuments({ storeId });
            syncContext.log(
              "info",
              `Database verification - Current count: ${dbCount} products for ${storeId}`
            );
          }
        } catch (error) {
          syncContext.log("error", `Error processing batch:`, error);
          syncContext.recordFailure(currentBatch.length);
          failed += currentBatch.length;
        }
      }

      // If we've hit our maximum, break out of the loop
      if (totalFetched >= maxProductsToProcess) {
        syncContext.log(
          "info",
          `Reached maximum products limit of ${maxProductsToProcess}, stopping early`
        );
        break;
      }
    }

    // Determine if this was a full sync
    const isFullSync = !config.lastSyncTime;

    // For full syncs, cleanup deleted products
    if (isFullSync && processedProductIds.length > 0 && !config.skipCleanup) {
      syncContext.log("info", `Cleaning up deleted products after full sync`);

      try {
        // Find and delete products that weren't in this sync
        const result = await ProductModel.deleteMany({
          storeId,
          productId: { $nin: processedProductIds },
        });

        syncContext.log(
          "info",
          `Cleaned up ${result.deletedCount} deleted products`
        );
      } catch (error) {
        syncContext.log("error", "Error cleaning up deleted products:", error);
      }
    }

    // Calculate final statistics
    const totalProcessed = created + updated + failed;
    const duration = (Date.now() - startTime) / 1000;
    const rate = totalProcessed / duration;

    syncContext.log(
      "info",
      `Completed Shopify product sync in ${duration.toFixed(0)}s - ` +
        `Created: ${created}, Updated: ${updated}, Failed: ${failed}, Total: ${totalProcessed} - ` +
        `Processing rate: ${rate.toFixed(2)} products/sec`
    );

    // Store stats in metadata
    syncContext.setMetadata("processedProductIds", processedProductIds);
    syncContext.setMetadata("stats", {
      created,
      updated,
      failed,
      duration,
      rate,
    });
  } catch (error) {
    syncContext.log("error", "Error in Shopify sync:", error);
    throw error;
  }
}

/**
 * Transform a Shopify product to our database model format
 */
function transformProduct(
  shopifyProduct: any,
  storeId: string
): Partial<IProduct> {
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
    storeId,
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
