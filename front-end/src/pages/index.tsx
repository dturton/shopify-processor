import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";
import Layout from "@/components/Layout";
import ProductGrid from "@/components/ProductGrid";
import { Product, ProductsResponse } from "@/lib/types";

const Home = () => {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Extract query parameters
  const {
    page = "1",
    limit = "12",
    search,
    vendor,
    productType,
  } = router.query;

  // Build the API URL with query parameters
  const getApiUrl = () => {
    const baseUrl = "/api/products";
    const queryParams = new URLSearchParams();

    queryParams.append("page", page as string);
    queryParams.append("limit", limit as string);

    if (search) queryParams.append("search", search as string);
    if (vendor) queryParams.append("vendor", vendor as string);
    if (productType) queryParams.append("productType", productType as string);

    return `${baseUrl}?${queryParams.toString()}`;
  };

  // Fetch products with SWR
  const { data, error, isLoading } = useSWR<ProductsResponse>(
    router.isReady ? getApiUrl() : null
  );

  // Update state when data changes
  useEffect(() => {
    if (data && data.success) {
      setProducts(data.data.products);

      if (data.data.pagination) {
        setCurrentPage(data.data.pagination.page);
        setTotalPages(data.data.pagination.pages);
      }
    }
  }, [data]);

  // Handle page change
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;

    const query = { ...router.query, page: newPage.toString() };
    router.push({ pathname: router.pathname, query });
  };

  // Generate page buttons for pagination
  const generatePageButtons = () => {
    const buttons = [];
    const maxButtonsToShow = 5;

    // Always show first page
    buttons.push(
      <button
        key="first"
        onClick={() => handlePageChange(1)}
        className={`px-3 py-1 mx-1 rounded ${
          currentPage === 1 ? "bg-blue-500 text-white" : "bg-gray-200"
        }`}
        disabled={currentPage === 1}
      >
        1
      </button>
    );

    // Calculate the range of pages to show
    let startPage = Math.max(2, currentPage - Math.floor(maxButtonsToShow / 2));
    let endPage = Math.min(totalPages - 1, startPage + maxButtonsToShow - 3);

    // Adjust if we're near the start
    if (startPage > 2) {
      buttons.push(
        <span key="ellipsis1" className="mx-1">
          ...
        </span>
      );
    }

    // Add the pages
    for (let i = startPage; i <= endPage; i++) {
      buttons.push(
        <button
          key={i}
          onClick={() => handlePageChange(i)}
          className={`px-3 py-1 mx-1 rounded ${
            currentPage === i ? "bg-blue-500 text-white" : "bg-gray-200"
          }`}
        >
          {i}
        </button>
      );
    }

    // Adjust if we're near the end
    if (endPage < totalPages - 1) {
      buttons.push(
        <span key="ellipsis2" className="mx-1">
          ...
        </span>
      );
    }

    // Always show last page if there is more than one page
    if (totalPages > 1) {
      buttons.push(
        <button
          key="last"
          onClick={() => handlePageChange(totalPages)}
          className={`px-3 py-1 mx-1 rounded ${
            currentPage === totalPages
              ? "bg-blue-500 text-white"
              : "bg-gray-200"
          }`}
          disabled={currentPage === totalPages}
        >
          {totalPages}
        </button>
      );
    }

    return buttons;
  };

  // Build the title based on filters
  const getTitle = () => {
    let title = "Products";

    if (search) title = `Search Results: "${search}"`;
    else if (vendor) title = `Products by ${vendor}`;
    else if (productType) title = `${productType} Products`;

    return title;
  };

  return (
    <Layout title={`${getTitle()} | Shopify Product Processor`}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{getTitle()}</h1>
        {data && data.data.pagination && (
          <p className="text-gray-600 mt-2">
            Showing {products.length} of {data.data.pagination.total} products
          </p>
        )}
      </div>

      {/* Active filters */}
      {(search || vendor || productType) && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-gray-600">Filters:</span>

          {search && (
            <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center">
              Search: "{search}"
              <button
                onClick={() => {
                  const { search, ...rest } = router.query;
                  router.push({ pathname: router.pathname, query: rest });
                }}
                className="ml-2 text-blue-500 hover:text-blue-700"
              >
                &times;
              </button>
            </div>
          )}

          {vendor && (
            <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center">
              Vendor: {vendor}
              <button
                onClick={() => {
                  const { vendor, ...rest } = router.query;
                  router.push({ pathname: router.pathname, query: rest });
                }}
                className="ml-2 text-blue-500 hover:text-blue-700"
              >
                &times;
              </button>
            </div>
          )}

          {productType && (
            <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center">
              Type: {productType}
              <button
                onClick={() => {
                  const { productType, ...rest } = router.query;
                  router.push({ pathname: router.pathname, query: rest });
                }}
                className="ml-2 text-blue-500 hover:text-blue-700"
              >
                &times;
              </button>
            </div>
          )}

          <button
            onClick={() => router.push(router.pathname)}
            className="px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-sm hover:bg-gray-300"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-md mb-6">
          Error loading products. Please try again later.
        </div>
      )}

      {/* Products grid */}
      <ProductGrid products={products} isLoading={isLoading} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex justify-center items-center">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-4 py-2 mr-2 bg-gray-200 rounded disabled:opacity-50"
          >
            Previous
          </button>

          <div className="flex">{generatePageButtons()}</div>

          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-4 py-2 ml-2 bg-gray-200 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </Layout>
  );
};

export default Home;
