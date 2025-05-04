import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Head from "next/head";

// Define Product type based on your model
interface Product {
  _id: string;
  productId: string;
  title: string;
  description?: string;
  handle: string;
  productType?: string;
  vendor?: string;
  tags?: string[];
  variants: Array<{
    variantId: string;
    price: string;
    sku: string;
    compareAtPrice?: string;
    inventoryQuantity?: number;
    inventoryItemId?: string;
  }>;
  // Add other fields as needed
}

export default function ProductPage() {
  const router = useRouter();
  const { productId } = router.query;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch when productId is available (after hydration)
    if (!productId) return;

    async function fetchProduct() {
      try {
        setLoading(true);
        const response = await fetch(`/api/products/${productId}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch product");
        }

        const data = await response.json();
        setProduct(data.data);
      } catch (err) {
        console.error("Error fetching product:", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch product"
        );
      } finally {
        setLoading(false);
      }
    }

    fetchProduct();
  }, [productId]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!product) return <div>Product not found</div>;

  return (
    <div>
      <Head>
        <title>{product.title}</title>
        <meta name="description" content={product.description || ""} />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Product details */}
          <div>
            <h1 className="text-3xl font-bold mb-4">{product.title}</h1>
            <p className="text-gray-600 mb-4">{product.productType}</p>
            <p className="text-gray-600 mb-4">Vendor: {product.vendor}</p>

            {product.description && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2">Description</h2>
                <div
                  dangerouslySetInnerHTML={{ __html: product.description }}
                ></div>
              </div>
            )}

            {/* Variants */}
            {product.variants.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2">Variants</h2>
                <div>
                  {product.variants.map((variant) => (
                    <div
                      key={variant.variantId}
                      className="border p-4 mb-2 rounded"
                    >
                      <p className="font-semibold">SKU: {variant.sku}</p>
                      <p className="text-lg">Price: ${variant.price}</p>
                      {variant.compareAtPrice && (
                        <p className="text-gray-500 line-through">
                          Compare at: ${variant.compareAtPrice}
                        </p>
                      )}
                      <p>
                        Inventory:{" "}
                        {variant.inventoryQuantity !== undefined
                          ? variant.inventoryQuantity
                          : "Not tracked"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {product.tags && product.tags.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2">Tags</h2>
                <div className="flex flex-wrap gap-2">
                  {product.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="bg-gray-200 px-3 py-1 rounded-full text-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* You could add product images here if you have them */}
          <div>
            <div className="bg-gray-200 w-full h-96 flex items-center justify-center">
              <p className="text-gray-500">Product Image Placeholder</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
