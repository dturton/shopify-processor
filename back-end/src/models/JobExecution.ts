// src/models/JobExecution.ts
import mongoose, { Schema, Document } from "mongoose";

// Interface extending the Document type
export interface IJobExecution extends Document {
  jobId: mongoose.Types.ObjectId;
  executionId: string;
  startTime: Date;
  endTime?: Date;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  progress: number;
  totalRecords: number;
  recordsSucceeded: number;
  recordsFailed: number;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  syncCursor?: string;
  syncType: "full" | "incremental";
  metadata: {
    [key: string]: any;
  };
  createdBy?: string;
}

// Create the schema
const JobExecutionSchema: Schema = new Schema(
  {
    // Reference to the parent IntegrationJob
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "IntegrationJob",
      required: true,
      index: true,
    },

    // Unique identifier for this execution
    executionId: {
      type: String,
      required: true,
      unique: true,
      default: () =>
        `exec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    },

    // Timing information
    startTime: {
      type: Date,
      default: Date.now,
      required: true,
    },

    endTime: {
      type: Date,
    },

    // Status tracking
    status: {
      type: String,
      enum: ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"],
      default: "PENDING",
      required: true,
      index: true,
    },

    // Progress tracking
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // Record counts
    totalRecords: {
      type: Number,
      default: 0,
    },

    recordsSucceeded: {
      type: Number,
      default: 0,
    },

    recordsFailed: {
      type: Number,
      default: 0,
    },

    // Error information (if failed)
    error: {
      message: String,
      stack: String,
      code: String,
    },

    // Sync cursor for resuming
    syncCursor: String,

    // Type of sync
    syncType: {
      type: String,
      enum: ["full", "incremental"],
      default: "incremental",
      required: true,
    },

    // Additional metadata
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },

    // Who triggered this execution
    createdBy: String,
  },
  {
    // This automatically adds and manages timestamps (createdAt, updatedAt)
    timestamps: true,
  }
);

// Create indexes for better performance
JobExecutionSchema.index({ jobId: 1, status: 1 });
JobExecutionSchema.index({ jobId: 1, startTime: -1 });
JobExecutionSchema.index({ status: 1, startTime: -1 });
JobExecutionSchema.index({ syncType: 1 });

// Add methods to get execution duration
JobExecutionSchema.methods.getDuration = function (): number | null {
  if (this.endTime && this.startTime) {
    return this.endTime.getTime() - this.startTime.getTime();
  }
  return null;
};

// Create and export the model
export const JobExecution = mongoose.model<IJobExecution>(
  "JobExecution",
  JobExecutionSchema
);
