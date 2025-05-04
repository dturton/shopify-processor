import { NextApiRequest, NextApiResponse } from "next";
import { connectToDatabase, ProductModel } from "@/lib/db";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Connect to the database
    await connectToDatabase();

    // Handle different HTTP methods
    switch (req.method) {
      case "GET":
        return await getProduct(req, res);
      default:
        return res
          .status(405)
          .json({ success: false, error: "Method not allowed" });
    }
  } catch (error) {
    console.error("API error:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

async function getProduct(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { productId } = req.query;
    const storeId = req.query.storeId || "sprayerdepot.myshopify.com";

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Product ID is required",
      });
    }

    // Find the product in the database
    const product = await ProductModel.findOne({
      productId: productId as string,
      storeId: storeId as string,
      "_sync_metadata.deleted_at": null, // Only show products that aren't deleted
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: `Product with ID ${productId} not found`,
      });
    }

    return res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error(`Error fetching product:`, error);
    return res.status(500).json({
      success: false,
      error: "Error fetching product",
    });
  }
}
