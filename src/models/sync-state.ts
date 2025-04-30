// src/models/sync-state.ts
import mongoose, { Schema, Document } from "mongoose";

export interface ISyncState extends Document {
  storeId: string; // Store identifier (e.g., mystore.myshopify.com)
  syncType: string; // Type of sync (e.g., 'products', 'orders')
  lastSyncedAt: Date; // When was the last successful sync
  lastSyncDuration: number; // Duration in milliseconds
  totalSyncs: number; // Total number of syncs performed
  totalProductsProcessed: number; // Total products processed across all syncs
  totalProductsCreated: number; // Total products created
  totalProductsUpdated: number; // Total products updated
  totalProductsDeleted: number; // Total products deleted (if applicable)
  lastSyncStats: {
    // Stats from the last sync
    startedAt: Date;
    completedAt: Date;
    productsProcessed: number;
    productsCreated: number;
    productsUpdated: number;
    productsDeleted: number;
    errors: Array<{
      productId: string;
      error: string;
    }>;
  };
  lastSyncError?: string; // Error message if last sync failed
  isInProgress: boolean; // Whether a sync is currently running
  createdAt: Date; // When this record was created
  updatedAt: Date; // When this record was last updated
}

const SyncStateSchema = new Schema<ISyncState>({
  storeId: { type: String, required: true },
  syncType: { type: String, required: true },
  lastSyncedAt: { type: Date },
  lastSyncDuration: { type: Number, default: 0 },
  totalSyncs: { type: Number, default: 0 },
  totalProductsProcessed: { type: Number, default: 0 },
  totalProductsCreated: { type: Number, default: 0 },
  totalProductsUpdated: { type: Number, default: 0 },
  totalProductsDeleted: { type: Number, default: 0 },
  lastSyncStats: {
    startedAt: { type: Date },
    completedAt: { type: Date },
    productsProcessed: { type: Number, default: 0 },
    productsCreated: { type: Number, default: 0 },
    productsUpdated: { type: Number, default: 0 },
    productsDeleted: { type: Number, default: 0 },
    errors: [
      {
        productId: { type: String },
        error: { type: String },
      },
    ],
  },
  lastSyncError: { type: String },
  isInProgress: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Create a compound unique index on storeId and syncType
SyncStateSchema.index({ storeId: 1, syncType: 1 }, { unique: true });

// Update timestamp on save
SyncStateSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const SyncStateModel = mongoose.model<ISyncState>(
  "SyncState",
  SyncStateSchema
);
