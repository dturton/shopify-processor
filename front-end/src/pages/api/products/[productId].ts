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

    // Find the product in your database
    const product = await ProductModel.findOne({
      productId: productId,
      "_sync_metadata.deleted_at": null,
    });

    if (!product) {
      // Return 404 with structured response
      return res.status(404).json({
        success: false,
        error: "Product not found",
        requestedId: productId,
      });
    }

    // Return the product if found
    return res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    return res.status(500).json({
      success: false,
      error: "Server error while fetching product",
    });
  }
}
