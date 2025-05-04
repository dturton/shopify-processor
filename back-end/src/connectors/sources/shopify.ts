// src/connectors/sources/shopify.ts
import { SyncContext } from "../../types";
import { ShopifyAPI } from "../../services/shopify-api";
import { ProductModel, IProduct, ISyncMetadata } from "../../models/product";
import {
  formatISOWithOffset,
  formatShopifyDate,
  normalizeToISO,
} from "../../utils/dateUtils";

export default async function fetchData(
  syncContext: SyncContext
): Promise<void> {
  try {
    // Get configuration from sync context
    const config = syncContext.getConfig();
    const storeId = config.shopName || "default-store";
    const syncCursor = new Date().toISOString(); // Use timestamp as cursor for this sync run

    // Initialize the Shopify API with credentials from config
    const shopifyAPI = new ShopifyAPI({
      shopName: config.shopName,
      accessToken: config.accessToken,
    });

    syncContext.log(
      "info",
      `Processing Shopify products for shop: ${config.shopName} with sync cursor: ${syncCursor}`
    );

    // Configure filters for the product fetch
    const filters = config.filters || {};

    // Add lastSyncTime to filters if available (for incremental sync)
    if (config.lastSyncTime) {
      // Convert lastSyncTime to valid Date object
      let lastSyncDate: Date;

      if (config.lastSyncTime instanceof Date) {
        lastSyncDate = config.lastSyncTime;
      } else {
        try {
          lastSyncDate = new Date(config.lastSyncTime);
          if (isNaN(lastSyncDate.getTime())) {
            throw new Error("Invalid date");
          }
        } catch (error) {
          syncContext.log(
            "error",
            `Invalid lastSyncTime format: ${config.lastSyncTime}. Using current time.`
          );
          lastSyncDate = new Date();
        }
      }

      // Format for Shopify API query
      const shopifyFormattedDate = formatShopifyDate(lastSyncDate);

      // Format for logs and metadata (ISO 8601 with timezone offset)
      const isoFormattedDate = normalizeToISO(lastSyncDate);

      syncContext.log(
        "info",
        `Performing incremental sync with lastSyncTime: ${isoFormattedDate} (Shopify format: ${shopifyFormattedDate})`
      );

      // Add updated_at filter for incremental sync - using Shopify format
      filters.updatedAtMin = shopifyFormattedDate;

      // Store the ISO formatted date in metadata for reference
      syncContext.setMetadata("lastSyncTimeISO", isoFormattedDate);

      // Get count of products modified since lastSyncTime
      try {
        // First get the count before starting the sync process
        const productsCount = await shopifyAPI.getProductsCount(
          shopifyFormattedDate
        );
        syncContext.log(
          "info",
          `Found ${productsCount} products modified since lastSyncTime`
        );

        // Set the total count in sync context
        syncContext.recordTotalCount(productsCount);

        // Store the count in metadata
        syncContext.setMetadata("modifiedProductsCount", productsCount);

        if (productsCount === 0) {
          syncContext.log(
            "info",
            "No products modified since last sync, skipping processing"
          );

          // Complete the sync early with zero products
          syncContext.updateProgress(100);
          return;
        }
      } catch (error) {
        syncContext.log(
          "warn",
          `Error getting count of modified products: ${error}. Continuing with sync.`
        );
      }
    } else {
      syncContext.log(
        "info",
        "Performing full sync (no lastSyncTime available)"
      );

      // For full sync, get total product count
      try {
        const productsCount = await shopifyAPI.getProductsCount("");
        syncContext.log(
          "info",
          `Found ${productsCount} total products in store`
        );

        // Set the total count in sync context
        syncContext.recordTotalCount(productsCount);

        // Store the count in metadata
        syncContext.setMetadata("totalProductsCount", productsCount);
      } catch (error) {
        syncContext.log(
          "warn",
          `Error getting total product count: ${error}. Continuing with sync.`
        );
      }
    }
  } catch (error) {
    syncContext.log("error", `Error in Shopify sync: ${error}`);
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
