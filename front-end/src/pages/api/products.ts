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
        return await getProducts(req, res);
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

async function getProducts(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Extract query parameters
    const {
      storeId = "sprayerdepot.myshopify.com",
      page = "1",
      limit = "12",
      vendor,
      productType,
      search,
    } = req.query;

    // Build the query
    const query: any = { storeId };

    // Only show products that aren't marked as deleted
    query["_sync_metadata.deleted_at"] = null;

    // Add optional filters
    if (vendor) {
      query.vendor = vendor;
    }

    if (productType) {
      query.productType = productType;
    }

    // Add text search if provided
    if (search) {
      query.$or = [
        { title: { $regex: search as string, $options: "i" } },
        { description: { $regex: search as string, $options: "i" } },
        { "variants.sku": { $regex: search as string, $options: "i" } },
      ];
    }

    // Calculate pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Execute query with pagination
    const products = await ProductModel.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await ProductModel.countDocuments(query);

    // Return the results
    return res.status(200).json({
      success: true,
      data: {
        products,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return res
      .status(500)
      .json({ success: false, error: "Error fetching products" });
  }
}
