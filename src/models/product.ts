// In src/models/product.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IProduct extends Document {
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
  createdAt: Date;
  updatedAt: Date;
  shopifyCreatedAt: Date;
  shopifyUpdatedAt: Date;
}

const ProductSchema = new Schema<IProduct>({
  productId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String },
  handle: { type: String, required: true },
  productType: { type: String },
  vendor: { type: String },
  tags: [{ type: String }],
  variants: [
    {
      variantId: { type: String, required: true },
      price: { type: String, required: true },
      sku: { type: String, required: true },
      compareAtPrice: { type: String },
      inventoryQuantity: { type: Number },
      inventoryItemId: { type: String },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  shopifyCreatedAt: { type: Date },
  shopifyUpdatedAt: { type: Date },
});

// Add indexes for common queries
ProductSchema.index({ productId: 1 });
ProductSchema.index({ productType: 1 });
ProductSchema.index({ vendor: 1 });
ProductSchema.index({ "variants.variantId": 1 });
ProductSchema.index({ shopifyUpdatedAt: -1 });

// Create or update hook
ProductSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const ProductModel = mongoose.model<IProduct>("Product", ProductSchema);
