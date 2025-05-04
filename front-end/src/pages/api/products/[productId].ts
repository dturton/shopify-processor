// pages/api/products/[productId].ts
import type { NextApiRequest, NextApiResponse } from "next";
import type { IProduct } from "@back-end/models/product";
import { ProductModel } from "@back-end/models/product";
import mongoose from "mongoose";
import logger from "@back-end/utils/logger";

// Define the response type
type ProductResponse = {
  success: boolean;
  data?: any;
  error?: string;
};

// Connect to MongoDB (if not already connected)
const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) return;

  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/shopify-processor"
    );
    logger.info("MongoDB connected from API route");
  } catch (error) {
    logger.error("MongoDB connection error:", error);
    throw new Error("Failed to connect to database");
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProductResponse>
) {
  // Only allow GET requests
  if (req.method !== "GET") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    // Connect to the database
    await connectDB();

    // Get the product ID from the URL
    const { productId } = req.query;

    if (!productId || Array.isArray(productId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid product ID",
      });
    }

    logger.info(`API: Fetching product details for ID: ${productId}`);

    // Query the database for the product
    const product = await ProductModel.findOne({ productId }).lean();

    // If product not found, return 404
    if (!product) {
      logger.warn(`API: Product with ID ${productId} not found`);
      return res.status(404).json({
        success: false,
        error: `Product with ID ${productId} not found`,
      });
    }

    logger.info(`API: Successfully retrieved product: ${product.title}`);

    // Return the product data
    return res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    // Log and return any errors
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(`API: Error fetching product:`, error);

    return res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
}
