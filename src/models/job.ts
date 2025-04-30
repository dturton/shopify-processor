import mongoose, { Schema, Document } from "mongoose";
import { JobData, ProductStatus } from "../types";

export interface IJob extends Document, JobData {
  completedProducts: number;
  failedProducts: number;
  products: ProductStatus[];
}

const JobSchema = new Schema<IJob>({
  jobId: { type: String, required: true, unique: true },
  totalProducts: { type: Number, required: true },
  completedProducts: { type: Number, default: 0 },
  failedProducts: { type: Number, default: 0 },
  status: { type: String, required: true },
  action: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  products: [
    {
      productId: { type: String, required: true },
      status: { type: String, required: true },
      result: { type: Schema.Types.Mixed },
      error: { type: String },
    },
  ],
});

// Add index for faster lookups
JobSchema.index({ jobId: 1 });
JobSchema.index({ "products.productId": 1 });

export const JobModel = mongoose.model<IJob>("Job", JobSchema);
