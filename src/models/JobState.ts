// src/models/JobState.ts
import mongoose, { Schema, Document } from "mongoose";

// Interface extending the Document type
export interface IJobState extends Document {
  jobId: string;
  createdAt: Date;
  updatedAt: Date;
  status: "CREATED" | "RUNNING" | "COMPLETED" | "FAILED";
  totalRecords: number;
  recordsSucceeded: number;
  recordsFailed: number;
  sourceType: string;
  destinationType: string;
  progress: number;
  lastSyncTime: Date | null; // Added lastSyncTime field
}

// Create the schema
const JobStateSchema: Schema = new Schema(
  {
    // Added jobId field with validation
    jobId: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function (v: string) {
          return v !== null && v !== undefined && v !== "";
        },
        message: "Job ID cannot be null, undefined, or empty string",
      },
    },

    // Status with enum validation
    status: {
      type: String,
      required: true,
      enum: ["CREATED", "RUNNING", "COMPLETED", "FAILED"],
      default: "CREATED",
    },

    // Record counts
    totalRecords: { type: Number, default: 0 },
    recordsSucceeded: { type: Number, default: 0 },
    recordsFailed: { type: Number, default: 0 },

    // Integration types
    sourceType: { type: String, required: true },
    destinationType: { type: String, required: true },

    // Progress tracking
    progress: { type: Number, default: 0, min: 0, max: 100 },

    // Last sync time for incremental syncing
    lastSyncTime: { type: Date, default: null },
  },
  {
    // This automatically adds and manages createdAt and updatedAt fields
    timestamps: true,

    // Schema options
    versionKey: false, // Don't include the __v field

    // Define indexes for better performance
    indexes: [
      { status: 1 },
      { sourceType: 1 },
      { destinationType: 1 },
      { createdAt: 1 },
      { lastSyncTime: 1 }, // Added index for lastSyncTime
    ],
  }
);

// Create and export the model
export const JobState = mongoose.model<IJobState>("JobState", JobStateSchema);
