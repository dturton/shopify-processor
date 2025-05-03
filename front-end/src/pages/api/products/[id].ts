import React from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import useSWR from "swr";
import Layout from "@/components/Layout";
import ProductDetail from "@/components/ProductDetail";
import { ProductResponse } from "@/lib/types";

const ProductPage = () => {
  const router = useRouter();
  const { id } = router.query;

  // Fetch product with SWR
  const { data, error, isLoading } = useSWR<ProductResponse>(
    id ? `/api/products/${id}` : null
  );

  return (
    <Layout
      title={
        data?.data.title
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

      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-md mb-6">
          Error loading product details. Please try again later.
        </div>
      )}

      {!isLoading && !error && !data && (
        <div className="bg-yellow-100 text-yellow-700 p-4 rounded-md mb-6">
          Product not found. It may have been deleted or the ID is incorrect.
        </div>
      )}

      {data && data.success && <ProductDetail product={data.data} />}
    </Layout>
  );
};

export default ProductPage;
