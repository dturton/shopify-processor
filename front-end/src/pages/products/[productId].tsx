import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import useSWR from "swr";
import Layout from "@/components/Layout";
import ProductDetail from "@/components/ProductDetail";
import { ProductResponse } from "@/lib/types";

const ProductPage = () => {
  const router = useRouter();
  const [isNotFound, setIsNotFound] = useState(false);

  // Only fetch when router is ready
  const { productId } = router.query;
  const shouldFetch = router.isReady && productId;

  // In your [productId].tsx file
  const { data, error, isLoading } = useSWR<ProductResponse>(
    shouldFetch ? `/api/products/${productId}` : null,
    {
      onError: (err) => {
        console.error("Product fetch error:", {
          message: err.message,
          status: err.status,
          info: err.info,
          stack: err.stack,
        });
      },
    }
  );

  // Update your error display to show more details
  {
    error && (
      <div className="bg-red-100 text-red-700 p-4 rounded-md mb-6">
        <h2 className="text-xl font-semibold mb-2">Error Loading Product</h2>
        <p>There was a problem retrieving the product information.</p>
        <p className="text-sm mt-2">
          Error details: {error.message || "Unknown error"}
        </p>
        <p className="text-sm">Status: {error.status || "Unknown"}</p>
        {error.info && (
          <p className="text-sm">
            Additional info: {JSON.stringify(error.info)}
          </p>
        )}
      </div>
    );
  }

  // For debugging - log the responses
  useEffect(() => {
    if (shouldFetch) {
      console.log(`Requesting product with ID: ${productId}`);
    }
    if (data) {
      console.log("API Response:", data);
    }
    if (error) {
      console.error("API Error:", error);
    }
  }, [shouldFetch, productId, data, error]);

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
      {(isNotFound || (data && !data.success)) && (
        <div className="bg-yellow-100 text-yellow-700 p-4 rounded-md mb-6">
          <h2 className="text-xl font-semibold mb-2">Product Not Found</h2>
          <p>We couldn't find a product with ID: {productId}</p>
          <p className="mt-4">
            The product may have been deleted or the ID is incorrect.
          </p>
          <p className="mt-2 text-sm">
            Try checking the browser console for more details.
          </p>
          <p className="mt-4">
            <Link href="/" className="text-blue-600 hover:underline">
              View all products
            </Link>
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-md mb-6">
          <h2 className="text-xl font-semibold mb-2">Error Loading Product</h2>
          <p>There was a problem retrieving the product information.</p>
          <p className="text-sm mt-2">
            Error details: {error.message || "Unknown error"}
          </p>
          <p className="text-sm">Status: {error.status || "Unknown"}</p>
          {error.info && (
            <p className="text-sm">
              Additional info: {JSON.stringify(error.info)}
            </p>
          )}
        </div>
      )}
      {data && data.success && data.data && (
        <ProductDetail product={data.data} />
      )}
    </Layout>
  );
};

export default ProductPage;
