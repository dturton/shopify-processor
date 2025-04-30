// src/services/shopify-api.ts
import { createAdminApiClient } from "@shopify/admin-api-client";
import { ShopifyCredentials, ProductFilters } from "../types";
import logger from "../utils/logger";

export class ShopifyAPI {
  private client: ReturnType<typeof createAdminApiClient>;

  constructor(credentials: ShopifyCredentials) {
    this.client = createAdminApiClient({
      storeDomain: credentials.shopName,
      accessToken: credentials.accessToken,
      apiVersion: "2025-01", // Update this according to the latest Shopify API version
    });
  }

  /**
   * Gets product IDs from Shopify with the option to fetch all or a limited number
   * @param filters - Product filters
   * @param options - Pagination options, including fetch all option
   * @returns Promise with product IDs
   */
  async getProductIds(
    filters: ProductFilters = {},
    options: {
      limit?: number | "all";
      cursor?: string | null;
      batchSize?: number;
    } = {}
  ): Promise<string[]> {
    try {
      // If limit is 'all', use pagination to get all products
      if (options.limit === "all") {
        logger.info("Fetching all product IDs from Shopify", { filters });

        const allProductIds: string[] = [];
        let hasNextPage = true;
        let cursor: string | null = null;
        const batchSize = options.batchSize || 250; // Default to maximum allowed by Shopify

        // Construct the GraphQL query with #graphql tag for code generation
        const query = `#graphql
        query GetProductIds($first: Int!, $after: String, $query: String) {
          products(first: $first, after: $after, query: $query) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
              }
            }
          }
        }
      `;

        // Build query string for filtering
        const queryParts = [];
        if (filters.productType) {
          queryParts.push(`product_type:${filters.productType}`);
        }
        if (filters.vendor) {
          queryParts.push(`vendor:${filters.vendor}`);
        }
        if (filters.createdAtMin) {
          queryParts.push(`created_at:>=${filters.createdAtMin}`);
        }
        if (filters.createdAtMax) {
          queryParts.push(`created_at:<=${filters.createdAtMax}`);
        }
        if (filters.updatedAtMin) {
          queryParts.push(`updated_at:>=${filters.updatedAtMin}`);
        }
        if (filters.updatedAtMax) {
          queryParts.push(`updated_at:<=${filters.updatedAtMax}`);
        }

        // Loop until we've fetched all products
        while (hasNextPage) {
          // Prepare variables for the GraphQL request
          const variables: {
            first: number;
            after: string | null;
            query: string | null;
          } = {
            first: batchSize,
            after: cursor,
            query: queryParts.length > 0 ? queryParts.join(" AND ") : null,
          };

          // Make the request with the query and variables
          const { data } = await this.client.request(query, {
            variables,
          });

          // Extract product IDs from the response
          const pageProductIds = data.products.edges.map((edge: any) => {
            // GraphQL IDs are in the format "gid://shopify/Product/1234567890"
            // We extract just the numeric part
            const id = edge.node.id.split("/").pop();
            return id;
          });

          // Add this page's IDs to our complete list
          allProductIds.push(...pageProductIds);

          // Update pagination info for next iteration
          hasNextPage = data.products.pageInfo.hasNextPage;
          cursor = data.products.pageInfo.endCursor;

          logger.info(
            `Retrieved ${pageProductIds.length} products (total so far: ${allProductIds.length})`
          );
        }

        logger.info(
          `Completed product retrieval. Total products: ${allProductIds.length}`
        );
        return allProductIds;
      }
      // If limit is a number, just get that many products
      else {
        const limit = options.limit || 50;
        const cursor = options.cursor || null;

        // Construct the GraphQL query with #graphql tag for code generation
        const query = `#graphql
        query GetProductIds($first: Int!, $after: String, $query: String) {
          products(first: $first, after: $after, query: $query) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
              }
            }
          }
        }
      `;

        // Build query string for filtering
        const queryParts = [];
        if (filters.productType) {
          queryParts.push(`product_type:${filters.productType}`);
        }
        if (filters.vendor) {
          queryParts.push(`vendor:${filters.vendor}`);
        }
        if (filters.createdAtMin) {
          queryParts.push(`created_at:>=${filters.createdAtMin}`);
        }
        if (filters.createdAtMax) {
          queryParts.push(`created_at:<=${filters.createdAtMax}`);
        }
        if (filters.updatedAtMin) {
          queryParts.push(`updated_at:>=${filters.updatedAtMin}`);
        }
        if (filters.updatedAtMax) {
          queryParts.push(`updated_at:<=${filters.updatedAtMax}`);
        }

        // Prepare variables for the GraphQL request
        const variables = {
          first: Math.min(limit, 250), // Ensure we don't exceed Shopify's maximum
          after: cursor,
          query: queryParts.length > 0 ? queryParts.join(" AND ") : null,
        };

        // Make the request with the query and variables
        const { data } = await this.client.request(query, {
          variables,
        });

        // Extract product IDs from the response
        const productIds = data.products.edges.map((edge: any) => {
          // GraphQL IDs are in the format "gid://shopify/Product/1234567890"
          // We extract just the numeric part
          const id = edge.node.id.split("/").pop();
          return id;
        });

        logger.info(`Retrieved ${productIds.length} products from Shopify`);
        return productIds;
      }
    } catch (error) {
      logger.error("Error fetching products from Shopify:", error);
      throw error;
    }
  }

  async getShopInfo(): Promise<{ id: string }> {
    const query = `#graphql
      query GetShopInfo {
        shop {
          name
        }
      }
    `;

    try {
      const { data } = await this.client.request(query);
      logger.info("Retrieved shop information from Shopify", data);
      return data;
    } catch (error) {
      logger.error("Error fetching shop information from Shopify:", error);
      throw error;
    }
  }

  async getProduct(productId: string): Promise<any> {
    try {
      const query = `#graphql
        query GetProduct($id: ID!) {
          product(id: $id) {
            id
            title
            description
            handle
            productType
            vendor
            totalInventory
            createdAt
            updatedAt
            tags
            variants(first: 100) {
              edges {
                node {
                  id
                  price
                  sku
                  compareAtPrice
                  inventoryQuantity
                  inventoryItem {
                    id
                  }
                }
              }
            }
          }
        }
      `;

      // Format the product ID if needed
      const formattedId = productId.includes("gid://")
        ? productId
        : `gid://shopify/Product/${productId}`;

      // Prepare variables
      const variables = {
        id: formattedId,
      };

      const { data } = await this.client.request(query, {
        variables,
      });

      // Transform the GraphQL response to match the expected format
      // This will help keep compatibility with existing code
      const product = data.product;

      // Transform variants
      const variants = product.variants.edges.map((edge: any) => {
        const variant = edge.node;
        return {
          id: variant.id.split("/").pop(),
          price: variant.price,
          compare_at_price: variant.compareAtPrice,
          sku: variant.sku,
          inventory_quantity: variant.inventoryQuantity,
          inventory_item_id: variant.inventoryItem?.id?.split("/").pop(),
        };
      });

      const transformedProduct = {
        id: product.id.split("/").pop(),
        title: product.title,
        description: product.description,
        handle: product.handle,
        product_type: product.productType,
        vendor: product.vendor,
        tags: product.tags,
        variants: variants,
        created_at: product.createdAt,
        updated_at: product.updatedAt,
      };

      logger.debug(`Retrieved product ${productId} from Shopify`);

      return transformedProduct;
    } catch (error) {
      logger.error(`Error fetching product ${productId} from Shopify:`, error);
      throw error;
    }
  }

  async updateProductTags(product: any, tags: string[]): Promise<any> {
    try {
      const productId = typeof product === "object" ? product.id : product;
      const formattedId = productId.includes("gid://")
        ? productId
        : `gid://shopify/Product/${productId}`;

      const mutation = `#graphql
        mutation UpdateProductTags($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
              title
              tags
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        input: {
          id: formattedId,
          tags: tags,
        },
      };

      const { data } = await this.client.request(mutation, {
        variables,
      });

      if (data.productUpdate.userErrors.length > 0) {
        throw new Error(data.productUpdate.userErrors[0].message);
      }

      logger.info(`Updated tags for product ${productId}`);

      // Transform the response to match the expected format
      const updatedProduct = {
        id: data.productUpdate.product.id.split("/").pop(),
        title: data.productUpdate.product.title,
        tags: data.productUpdate.product.tags,
      };

      return updatedProduct;
    } catch (error) {
      const productId = typeof product === "object" ? product.id : product;
      logger.error(`Error updating tags for product ${productId}:`, error);
      throw error;
    }
  }

  async updateInventory(product: any, inventory: number): Promise<any> {
    try {
      const productId = typeof product === "object" ? product.id : product;

      // First, get the product to get the inventory item IDs
      const productData = await this.getProduct(productId);

      // Prepare mutations for each variant
      const results = [];

      for (const variant of productData.variants) {
        const inventoryItemId = variant.inventory_item_id;

        if (!inventoryItemId) {
          logger.warn(
            `No inventory item ID for variant ${variant.id} of product ${productId}`
          );
          continue;
        }

        const formattedInventoryItemId = `gid://shopify/InventoryItem/${inventoryItemId}`;

        // Get available locations
        const locationQuery = `#graphql
          query GetInventoryLevels($id: ID!) {
            inventoryItem(id: $id) {
              inventoryLevels(first: 1) {
                edges {
                  node {
                    location {
                      id
                    }
                  }
                }
              }
            }
          }
        `;

        const locationVariables = {
          id: formattedInventoryItemId,
        };

        const { data: locationData } = await this.client.request(
          locationQuery,
          {
            variables: locationVariables,
          }
        );

        if (!locationData.inventoryItem?.inventoryLevels?.edges?.[0]) {
          logger.warn(
            `No inventory levels found for inventory item ${inventoryItemId}`
          );
          continue;
        }

        const locationId =
          locationData.inventoryItem.inventoryLevels.edges[0].node.location.id;

        // Update inventory
        const mutation = `#graphql
          mutation UpdateInventory($input: InventoryAdjustQuantityInput!) {
            inventoryAdjustQuantity(input: $input) {
              inventoryLevel {
                available
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const inventoryVariables = {
          input: {
            inventoryItemId: formattedInventoryItemId,
            locationId: locationId,
            availableDelta: inventory - variant.inventory_quantity,
          },
        };

        const { data } = await this.client.request(mutation, {
          variables: inventoryVariables,
        });

        if (data.inventoryAdjustQuantity.userErrors.length > 0) {
          throw new Error(data.inventoryAdjustQuantity.userErrors[0].message);
        }

        results.push({
          variant_id: variant.id,
          inventory_item_id: inventoryItemId,
          location_id: locationId.split("/").pop(),
          available: data.inventoryAdjustQuantity.inventoryLevel.available,
        });
      }

      logger.info(`Updated inventory for product ${productId}`);

      return results;
    } catch (error) {
      const productId = typeof product === "object" ? product.id : product;
      logger.error(`Error updating inventory for product ${productId}:`, error);
      throw error;
    }
  }

  async updatePrice(product: any, price: number): Promise<any> {
    try {
      const productId = typeof product === "object" ? product.id : product;

      // First, get the product to get the variant IDs
      const productData = await this.getProduct(productId);

      // Prepare mutations for each variant
      const results = [];

      for (const variant of productData.variants) {
        const variantId = variant.id;
        const formattedVariantId = `gid://shopify/ProductVariant/${variantId}`;

        const mutation = `#graphql
          mutation UpdateVariantPrice($input: ProductVariantInput!) {
            productVariantUpdate(input: $input) {
              productVariant {
                id
                price
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const variables = {
          input: {
            id: formattedVariantId,
            price: price.toString(),
          },
        };

        const { data } = await this.client.request(mutation, {
          variables,
        });

        if (data.productVariantUpdate.userErrors.length > 0) {
          throw new Error(data.productVariantUpdate.userErrors[0].message);
        }

        results.push({
          id: data.productVariantUpdate.productVariant.id.split("/").pop(),
          price: data.productVariantUpdate.productVariant.price,
        });
      }

      logger.info(`Updated price for product ${productId}`);

      return results;
    } catch (error) {
      const productId = typeof product === "object" ? product.id : product;
      logger.error(`Error updating price for product ${productId}:`, error);
      throw error;
    }
  }

  async updateMetafield(
    product: any,
    namespace: string,
    key: string,
    value: string,
    type: string
  ): Promise<any> {
    try {
      const productId = typeof product === "object" ? product.id : product;
      const formattedId = productId.includes("gid://")
        ? productId
        : `gid://shopify/Product/${productId}`;

      const mutation = `#graphql
        mutation UpdateProductMetafield($input: ProductInput!, $namespace: String!, $key: String!) {
          productUpdate(input: $input) {
            product {
              id
              metafield(namespace: $namespace, key: $key) {
                id
                namespace
                key
                value
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      // Prepare the variables
      const variables = {
        input: {
          id: formattedId,
          metafields: [
            {
              namespace,
              key,
              value,
              type,
            },
          ],
        },
        namespace,
        key,
      };

      const { data } = await this.client.request(mutation, {
        variables,
      });

      if (data.productUpdate.userErrors.length > 0) {
        throw new Error(data.productUpdate.userErrors[0].message);
      }

      logger.info(
        `Updated metafield ${namespace}.${key} for product ${productId}`
      );

      // Transform the response to match the expected format
      const metafield = data.productUpdate.product.metafield;
      const result = {
        id: metafield?.id?.split("/").pop(),
        namespace: metafield?.namespace,
        key: metafield?.key,
        value: metafield?.value,
      };

      return result;
    } catch (error) {
      const productId = typeof product === "object" ? product.id : product;
      logger.error(`Error updating metafield for product ${productId}:`, error);
      throw error;
    }
  }
}
