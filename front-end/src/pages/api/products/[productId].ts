import { ProductModel } from "@/lib/db";
import { NextApiRequest, NextApiResponse } from "next";
// In pages/api/products/[productId].ts
// In pages/api/products/[productId].ts
async function getProductById(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { productId } = req.query;

    if (!productId || Array.isArray(productId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid product ID parameter",
      });
    }

    console.log(`API: Looking up product with ID: ${productId}`);

    // Try different ways of querying
    const productByExactId = await ProductModel.findOne({ productId });
    const productByStringId = await ProductModel.findOne({
      productId: productId.toString(),
    });

    // If you're unsure about the field name, try a more general search
    const productsWithSimilarId = await ProductModel.find({
      $or: [
        { productId: productId },
        { productId: productId.toString() },
        { "variants.variantId": productId },
        { _id: productId.match(/^[0-9a-fA-F]{24}$/) ? productId : null },
      ],
    }).limit(5);

    if (!productByExactId) {
      console.log(`Product with exact ID ${productId} not found`);
      console.log(`Found by string: ${productByStringId ? "Yes" : "No"}`);
      console.log(`Similar matches: ${productsWithSimilarId.length}`);

      if (productsWithSimilarId.length > 0) {
        console.log(
          "Similar matches:",
          productsWithSimilarId.map((p) => ({
            id: p.productId,
            title: p.title,
          }))
        );
      }

      return res.status(404).json({
        success: false,
        error: "Product not found",
        requestedId: productId,
        similarMatches: productsWithSimilarId.length,
      });
    }

    // Return the product if found
    return res.status(200).json({
      success: true,
      data: productByExactId,
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    return res.status(500).json({
      success: false,
      error: "Server error while fetching product",
      message: error.message,
    });
  }
}
