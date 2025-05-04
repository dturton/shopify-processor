import React, { useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import useSWR from "swr";
import Layout from "@/components/Layout";
import ProductDetail from "@/components/ProductDetail";
import { ProductResponse } from "@/lib/types";

const ProductPage = () => {
  const router = useRouter();

  // Use useEffect to handle the loading state properly
  useEffect(() => {
    // Router might not be ready yet
    if (!router.isReady) return;

    // If the router is ready but has no query params, go to products page
    if (router.isReady && !router.query.productId) {
      console.log("No product ID found, redirecting to products page");
      router.push("/");
    }
  }, [router.isReady, router.query]);

  // Only proceed when router is ready and we have a productId
  const { productId } = router.query;

  // Fetch product with SWR - only when router is ready and productId exists
  const { data, error, isLoading } = useSWR<ProductResponse>(
    router.isReady && productId ? `/api/products/${productId}` : null
  );

  // Determine if the product was not found (404 from API)
  const isNotFound = error?.status === 404 || (data && !data.success);

  return (
    <Layout
      title={
        data?.data?.title
          ? `${data.data.title} | Shopify Product Processor`
          : "Product Details"
      }
    >
      <div className="mb-6">
        <Link href="/" className="text-blue-600 hover:text-blue-800">
          &larr; Back to Products
        </Link>
      </div>

      {isLoading && (
        <div className="py-10 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mr-2"></div>
          <span className="text-gray-600">Loading product details...</span>
        </div>
      )}

      {isNotFound && (
        <div className="bg-yellow-100 text-yellow-700 p-4 rounded-md mb-6">
          <h2 className="text-xl font-semibold mb-2">Product Not Found</h2>
          <p>We couldn't find a product with ID: {productId}</p>
          <p className="mt-4">
            The product may have been deleted or the ID is incorrect.
          </p>
          <p className="mt-4">
            <Link href="/" className="text-blue-600 hover:underline">
              View all products
            </Link>
          </p>
        </div>
      )}

      {error && !isNotFound && (
        <div className="bg-red-100 text-red-700 p-4 rounded-md mb-6">
          <h2 className="text-xl font-semibold mb-2">Error Loading Product</h2>
          <p>There was a problem retrieving the product information.</p>
          <p className="text-sm mt-2">
            Error details: {error.message || "Unknown error"}
          </p>
        </div>
      )}

      {data && data.success && data.data && (
        <ProductDetail product={data.data} />
      )}
    </Layout>
  );
};

export default ProductPage;
