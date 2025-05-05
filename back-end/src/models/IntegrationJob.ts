// src/models/IntegrationJob.ts
import mongoose, { Schema, Document } from "mongoose";

/**
 * Interface for the Integration Job model
 * This represents a reusable integration configuration that can be executed multiple times
 */
export interface IIntegrationJob extends Document {
  name: string;
  description?: string;
  sourceType: string;
  destinationType: string;
  configuration: {
    [key: string]: any;
  };
  enabled: boolean;
  schedule?: {
    frequency: "manual" | "hourly" | "daily" | "weekly" | "monthly";
    cronExpression?: string;
    lastScheduledAt?: Date;
  };
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  lastSuccessfulExecution?: Date;
  lastExecutionId?: string;
  metadata?: {
    [key: string]: any;
  };
}

// Create the schema
const IntegrationJobSchema: Schema = new Schema(
  {
    // Human readable name for this integration
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Optional description
    description: {
      type: String,
      trim: true,
    },

    // Source and destination system types
    sourceType: {
      type: String,
      required: true,
      index: true,
    },

    destinationType: {
      type: String,
      required: true,
      index: true,
    },

    // Configuration for this integration job (credentials, options, etc.)
    configuration: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },

    // Whether this job is enabled
    enabled: {
      type: Boolean,
      default: true,
    },

    // Optional scheduling configuration
    schedule: {
      frequency: {
        type: String,
        enum: ["manual", "hourly", "daily", "weekly", "monthly"],
        default: "manual",
      },
      cronExpression: String,
      lastScheduledAt: Date,
    },

    // Auditing fields
    createdBy: String,

    // References to last execution
    lastSuccessfulExecution: Date,
    lastExecutionId: String,

    // Additional metadata
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    // Automatically adds and manages createdAt and updatedAt fields
    timestamps: true,
  }
);

// Indexes for better performance
IntegrationJobSchema.index({ sourceType: 1, destinationType: 1 });
IntegrationJobSchema.index({ enabled: 1, "schedule.frequency": 1 });
IntegrationJobSchema.index({ lastSuccessfulExecution: 1 });

// Create and export the model
export const IntegrationJob = mongoose.model<IIntegrationJob>(
  "IntegrationJob",
  IntegrationJobSchema
);
