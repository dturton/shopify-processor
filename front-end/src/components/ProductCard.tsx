import React from "react";
import Link from "next/link";
import { Product } from "@/lib/types";
import { formatShortDate, getRelativeTimeString } from "@/lib/dateUtils";
import DateDisplay from "./DateDisplay";

interface ProductCardProps {
  product: Product;
}

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  // Format currency
  const formatPrice = (price: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(parseFloat(price));
  };

  // Get main price from first variant
  const mainPrice =
    product.variants.length > 0
      ? formatPrice(product.variants[0].price)
      : "Price not available";

  // Get compare at price if available
  const compareAtPrice =
    product.variants.length > 0 && product.variants[0].compareAtPrice
      ? formatPrice(product.variants[0].compareAtPrice)
      : null;

  // Format date in store's timezone (EST)
  const formatDate = (date: Date) => {
    return formatShortDate(date);
  };

  // Get relative time (e.g. "2 hours ago")
  const getRelativeTime = (date: Date) => {
    return getRelativeTimeString(date);
  };

  return (
    <Link href={`/products/${product.productId}`} className="block">
      <div className="product-card hover:shadow-lg">
        <h3 className="text-lg font-medium text-gray-900 mb-2 truncate">
          {product.title}
        </h3>

        <div className="mb-2">
          {compareAtPrice ? (
            <div className="flex items-center">
              <span className="text-lg font-semibold text-red-600">
                {mainPrice}
              </span>
              <span className="ml-2 text-sm text-gray-500 line-through">
                {compareAtPrice}
              </span>
            </div>
          ) : (
            <span className="text-lg font-semibold text-gray-900">
              {mainPrice}
            </span>
          )}
        </div>

        {product.vendor && (
          <div className="text-sm text-gray-600 mb-1">
            Vendor: {product.vendor}
          </div>
        )}

        {product.productType && (
          <div className="text-sm text-gray-600 mb-1">
            Type: {product.productType}
          </div>
        )}

        <div className="mt-3 flex justify-between text-xs text-gray-500">
          <div>
            Updated:{" "}
            <DateDisplay
              date={product.updatedAt}
              className="text-xs inline"
              showSeconds={false}
              showTimezone={false}
            />
          </div>
          <div>{product.variants.length} variant(s)</div>
        </div>

        {product.tags && product.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {product.tags.slice(0, 3).map((tag, index) => (
              <span
                key={index}
                className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full"
              >
                {tag}
              </span>
            ))}
            {product.tags.length > 3 && (
              <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                +{product.tags.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
};

export default ProductCard;
