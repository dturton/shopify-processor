import React from "react";
import ProductCard from "./ProductCard";
import { Product } from "@/lib/types";

interface ProductGridProps {
  products: Product[];
  isLoading?: boolean;
}

const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="py-10 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mr-2"></div>
        <span className="text-gray-600">Loading products...</span>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="py-10 text-center">
        <div className="text-gray-600">No products found</div>
      </div>
    );
  }

  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard key={product._id} product={product} />
      ))}
    </div>
  );
};

export default ProductGrid;
