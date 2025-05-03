import React from "react";
import Link from "next/link";
import useSWR from "swr";
import Layout from "@/components/Layout";

const Stats = () => {
  // Fetch stats with SWR
  const { data, error, isLoading } = useSWR("/api/stats");

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  return {
    props: {
      title: "Product Statistics | Shopify Product Processor",
      content: (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            Product Statistics
          </h1>
        </>
      )
    }
  };

      {isLoading && (
        <div className="py-10 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mr-2"></div>
          <span className="text-gray-600">Loading statistics...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-md mb-6">
          Error loading statistics. Please try again later.
        </div>
      )}

      {data && data.success && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Summary Statistics */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Summary
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-600">Total Products</p>
                <p className="text-2xl font-bold text-blue-800">
                  {data.data.totalProducts}
                </p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-sm text-red-600">Deleted Products</p>
                <p className="text-2xl font-bold text-red-800">
                  {data.data.deletedProducts}
                </p>
              </div>
            </div>
          </div>

          {/* Recently Updated */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Recently Updated
            </h2>
            {data.data.recentlyUpdated.length > 0 ? (
              <ul className="divide-y">
                {data.data.recentlyUpdated.map((product) => (
                  <li key={product.id} className="py-3">
                    <Link
                      href={`/products/${product.id}`}
                      className="hover:text-blue-600"
                    >
                      <div className="flex justify-between">
                        <div className="font-medium">{product.title}</div>
                        <div className="text-sm text-blue-600">
                          {product.action}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {formatDate(product.updatedAt)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">No recently updated products</p>
            )}
          </div>

          {/* Product Types */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Product Types
            </h2>
            {data.data.productTypes.length > 0 ? (
              <div className="overflow-hidden">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Count
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data.data.productTypes.map((type, index) => (
                      <tr key={index}>
                        <td className="px-4 py-2">
                          <Link
                            href={`/?productType=${encodeURIComponent(
                              type.type
                            )}`}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            {type.type}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-right">{type.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500">No product types found</p>
            )}
          </div>

          {/* Vendors */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Vendors
            </h2>
            {data.data.vendors.length > 0 ? (
              <div className="overflow-hidden">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Vendor
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Count
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data.data.vendors.map((vendor, index) => (
                      <tr key={index}>
                        <td className="px-4 py-2">
                          <Link
                            href={`/?vendor=${encodeURIComponent(vendor.name)}`}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            {vendor.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-right">{vendor.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500">No vendors found</p>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Stats;
