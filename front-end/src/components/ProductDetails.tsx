import React from "react";
import { Product } from "@/lib/types";

interface ProductDetailProps {
  product: Product;
}

const ProductDetail: React.FC<ProductDetailProps> = ({ product }) => {
  // Format currency
  const formatPrice = (price: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(parseFloat(price));
  };

  // Format date
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-6">
        <div className="flex justify-between items-start">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {product.title}
          </h1>
          <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
            {product._sync_metadata.last_action}
          </div>
        </div>

        {product.description && (
          <div className="mt-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              Description
            </h2>
            <p className="text-gray-600">{product.description}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              Product Information
            </h2>
            <table className="w-full">
              <tbody>
                <tr className="border-b">
                  <td className="py-2 text-gray-600">Product ID</td>
                  <td className="py-2 text-gray-900">{product.productId}</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 text-gray-600">Handle</td>
                  <td className="py-2 text-gray-900">{product.handle}</td>
                </tr>
                {product.vendor && (
                  <tr className="border-b">
                    <td className="py-2 text-gray-600">Vendor</td>
                    <td className="py-2 text-gray-900">{product.vendor}</td>
                  </tr>
                )}
                {product.productType && (
                  <tr className="border-b">
                    <td className="py-2 text-gray-600">Product Type</td>
                    <td className="py-2 text-gray-900">
                      {product.productType}
                    </td>
                  </tr>
                )}
                <tr className="border-b">
                  <td className="py-2 text-gray-600">Created</td>
                  <td className="py-2 text-gray-900">
                    {formatDate(product.shopifyCreatedAt)}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 text-gray-600">Updated</td>
                  <td className="py-2 text-gray-900">
                    {formatDate(product.shopifyUpdatedAt)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              Sync Information
            </h2>
            <table className="w-full">
              <tbody>
                <tr className="border-b">
                  <td className="py-2 text-gray-600">Last Action</td>
                  <td className="py-2 text-gray-900">
                    {product._sync_metadata.last_action}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 text-gray-600">First Seen</td>
                  <td className="py-2 text-gray-900">
                    {formatDate(product._sync_metadata.first_seen_at)}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 text-gray-600">Last Modified</td>
                  <td className="py-2 text-gray-900">
                    {formatDate(product._sync_metadata.last_modified_at)}
                  </td>
                </tr>
                {product._sync_metadata.deleted_at && (
                  <tr className="border-b">
                    <td className="py-2 text-gray-600">Deleted At</td>
                    <td className="py-2 text-gray-900">
                      {formatDate(product._sync_metadata.deleted_at)}
                    </td>
                  </tr>
                )}
                {product._sync_metadata.cursor && (
                  <tr className="border-b">
                    <td className="py-2 text-gray-600">Sync Cursor</td>
                    <td className="py-2 text-gray-900">
                      {product._sync_metadata.cursor}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {product.tags && product.tags.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {product.tags.map((tag, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Variants ({product.variants.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Variant ID
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Compare At
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Inventory
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {product.variants.map((variant) => (
                  <tr key={variant.variantId}>
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {variant.variantId}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {variant.sku}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {formatPrice(variant.price)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {variant.compareAtPrice
                        ? formatPrice(variant.compareAtPrice)
                        : "-"}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {variant.inventoryQuantity !== undefined
                        ? variant.inventoryQuantity
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
