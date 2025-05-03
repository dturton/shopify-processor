// In src/models/product.ts
import mongoose, { Schema, Document } from "mongoose";

// Define the sync metadata interface
export interface ISyncMetadata {
  deleted_at: Date | null;
  last_action: "ADDED" | "UPDATED" | "DELETED";
  first_seen_at: Date;
  cursor: string | null;
  last_modified_at: Date;
}

export interface IProduct extends Document {
  storeId: string;
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

  // Add the sync metadata
  _sync_metadata: ISyncMetadata;
}

// Create the schema for sync metadata
const SyncMetadataSchema = new Schema<ISyncMetadata>(
  {
    deleted_at: { type: Date, default: null },
    last_action: {
      type: String,
      enum: ["ADDED", "UPDATED", "DELETED"],
      required: true,
    },
    first_seen_at: { type: Date, required: true },
    cursor: { type: String, default: null },
    last_modified_at: { type: Date, required: true },
  },
  { _id: false }
); // _id: false prevents MongoDB from creating an _id for this subdocument

const ProductSchema = new Schema<IProduct>({
  storeId: { type: String, required: true },
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

  // Add the sync metadata field
  _sync_metadata: {
    type: SyncMetadataSchema,
    required: true,
    default: () => ({
      deleted_at: null,
      last_action: "ADDED",
      first_seen_at: new Date(),
      cursor: null,
      last_modified_at: new Date(),
    }),
  },
});

// Add indexes for common queries
ProductSchema.index({ storeId: 1 });
ProductSchema.index({ productId: 1 });
ProductSchema.index({ storeId: 1, productId: 1 }, { unique: true });
ProductSchema.index({ productType: 1 });
ProductSchema.index({ vendor: 1 });
ProductSchema.index({ "variants.variantId": 1 });
ProductSchema.index({ shopifyUpdatedAt: -1 });

// Add indexes for the sync metadata fields
ProductSchema.index({ "_sync_metadata.last_modified_at": -1 });
ProductSchema.index({ "_sync_metadata.first_seen_at": -1 });
ProductSchema.index({ "_sync_metadata.deleted_at": 1 });
ProductSchema.index({ "_sync_metadata.last_action": 1 });

// Create or update hook
ProductSchema.pre("save", function (next) {
  this.updatedAt = new Date();

  // Update the sync metadata
  if (this._sync_metadata) {
    this._sync_metadata.last_modified_at = new Date();

    // If it's a new document, set first_seen_at
    if (this.isNew) {
      this._sync_metadata.last_action = "ADDED";
      this._sync_metadata.first_seen_at = new Date();
    } else {
      this._sync_metadata.last_action = "UPDATED";
    }
  }

  next();
});

export const ProductModel = mongoose.model<IProduct>("Product", ProductSchema);
