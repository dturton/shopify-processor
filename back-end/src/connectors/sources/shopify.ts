// src/connectors/sources/shopify.ts
import { SyncContext } from "../../types";
import { ShopifyAPI } from "../../services/shopify-api";
import { ProductModel, IProduct, ISyncMetadata } from "../../models/product";

/**
 * Shopify connector with streaming pattern and sync metadata
 * Processes and saves products immediately with detailed tracking metadata
 */
export default async function fetchData(
  syncContext: SyncContext
): Promise<void> {
  try {
    // Get configuration from sync context
    const config = syncContext.getConfig();

    // Support both naming conventions for shop credentials
    const shopName = config.shopName || config.shopify?.shopName;
    const accessToken = config.accessToken || config.shopify?.accessToken;

    if (!shopName || !accessToken) {
      throw new Error(
        "Missing required Shopify credentials (shopName and accessToken)"
      );
    }

    const storeId = shopName || "default-store";
    const syncCursor = new Date().toISOString(); // Use timestamp as cursor for this sync run

    // Initialize the Shopify API with credentials from config
    const shopifyAPI = new ShopifyAPI({
      shopName,
      accessToken,
    });

    syncContext.log(
      "info",
      `Processing Shopify products for shop: ${shopName} with sync cursor: ${syncCursor}`
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
    const processedProductIds: string[] = [];
    const processedIdSet = new Set<string>(); // Add this to track unique IDs
    const maxProductsToProcess = config.maxProducts || Infinity;

    // Add a reasonable estimate based on your store size - with buffer
    const estimatedMaxProducts = config.estimatedMaxProducts || 3000; // Adjust based on your store size
    let duplicateCount = 0;

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

    // If this is a full sync, mark all existing products as needing verification
    let needsVerification = !config.lastSyncTime;
    if (needsVerification) {
      syncContext.log(
        "info",
        "Full sync - will mark products for verification"
      );
    }

    // Process each batch of product IDs as they're yielded by the generator
    for await (const productIdBatch of productIdsGenerator) {
      // Log each batch of IDs received
      syncContext.log(
        "info",
        `Received batch of ${
          productIdBatch.length
        } product IDs (total so far: ${totalFetched + productIdBatch.length})`
      );

      // Add these IDs to our processing queue, but filter duplicates
      const newUniqueIds = productIdBatch.filter(
        (id) => !processedIdSet.has(id)
      );
      if (newUniqueIds.length < productIdBatch.length) {
        const duplicatesInBatch = productIdBatch.length - newUniqueIds.length;
        duplicateCount += duplicatesInBatch;
        syncContext.log(
          "warn",
          `Found ${duplicatesInBatch} duplicate IDs in batch (total duplicates: ${duplicateCount})`
        );
      }
      productIdsToProcess = productIdsToProcess.concat(newUniqueIds);
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
              // See if this product already exists in the database
              const existingProduct = await ProductModel.findOne({
                storeId,
                productId: shopifyProduct.id,
              });

              // Transform the Shopify product to our database model format
              const transformedProduct = transformProduct(
                shopifyProduct,
                storeId,
                existingProduct as IProduct,
                syncCursor
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
              processedIdSet.add(shopifyProduct.id);
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

      // Check if we're processing too many products - failsafe
      if (
        totalFetched > estimatedMaxProducts * 2 ||
        processedProductIds.length > estimatedMaxProducts * 1.5 ||
        duplicateCount > estimatedMaxProducts
      ) {
        syncContext.log(
          "warn",
          `Detected potential issue: Processed ${processedProductIds.length} products, ` +
            `encountered ${duplicateCount} duplicates, total fetched: ${totalFetched}. ` +
            `Expected ~${estimatedMaxProducts} products. Stopping early to prevent excessive processing.`
        );

        // Log additional diagnostic information
        syncContext.log(
          "info",
          `Unique product count: ${processedIdSet.size}, ` +
            `Progress ratio: ${processedProductIds.length}/${totalFetched} = ${(
              (processedProductIds.length / totalFetched) *
              100
            ).toFixed(1)}%`
        );

        // Break out of the outer loop
        break;
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

    // For full syncs, mark products as deleted if they weren't in this sync
    if (isFullSync && processedProductIds.length > 0 && !config.skipCleanup) {
      syncContext.log("info", `Marking deleted products after full sync`);

      try {
        // Mark products that weren't in this sync as deleted
        const result = await ProductModel.updateMany(
          {
            storeId,
            productId: { $nin: processedProductIds },
            "_sync_metadata.deleted_at": null, // Only update products that aren't already marked as deleted
          },
          {
            $set: {
              "_sync_metadata.deleted_at": new Date(),
              "_sync_metadata.last_action": "DELETED",
              "_sync_metadata.last_modified_at": new Date(),
              "_sync_metadata.cursor": syncCursor,
            },
          }
        );

        syncContext.log(
          "info",
          `Marked ${result.modifiedCount} products as deleted`
        );

        // Optionally, physically delete products that have been marked as deleted for a certain period
        if (config.purgeDeletedAfterDays) {
          const purgeDate = new Date();
          purgeDate.setDate(purgeDate.getDate() - config.purgeDeletedAfterDays);

          const purgeResult = await ProductModel.deleteMany({
            storeId,
            "_sync_metadata.deleted_at": { $ne: null, $lte: purgeDate },
          });

          syncContext.log(
            "info",
            `Purged ${purgeResult.deletedCount} products that were marked as deleted more than ${config.purgeDeletedAfterDays} days ago`
          );
        }
      } catch (error) {
        syncContext.log("error", "Error handling deleted products:", error);
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
    syncContext.setMetadata("uniqueProductCount", processedIdSet.size);
    syncContext.setMetadata("duplicateCount", duplicateCount);
    syncContext.setMetadata("stats", {
      created,
      updated,
      failed,
      duration,
      rate,
    });
    syncContext.setMetadata("syncCursor", syncCursor);
  } catch (error) {
    syncContext.log("error", "Error in Shopify sync:", error);
    throw error;
  }
}

/**
 * Transform a Shopify product to our database model format
 * Includes sync metadata tracking
 */
function transformProduct(
  shopifyProduct: any,
  storeId: string,
  existingProduct: IProduct | null = null,
  cursor: string | null = null
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

  const now = new Date();

  // Prepare the sync metadata
  const syncMetadata: ISyncMetadata = existingProduct
    ? {
        // For existing products, preserve first_seen_at and update other fields
        deleted_at: null,
        last_action: "UPDATED",
        first_seen_at: existingProduct._sync_metadata.first_seen_at,
        cursor: cursor || existingProduct._sync_metadata.cursor,
        last_modified_at: now,
      }
    : {
        // For new products, set all fields
        deleted_at: null,
        last_action: "ADDED",
        first_seen_at: now,
        cursor: cursor,
        last_modified_at: now,
      };

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
    _sync_metadata: syncMetadata,
  };
}
