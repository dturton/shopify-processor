// src/models/Checkpoint.ts
import mongoose, { Schema, Document } from "mongoose";

// Interface for checkpoint documents
export interface ICheckpoint extends Document {
  jobId: string;
  lastProcessedId: string;
  processingStage: string;
  timestamp: Date;
  metadata: {
    [key: string]: any;
  };
}

// Create the schema
const CheckpointSchema: Schema = new Schema(
  {
    // Job ID that this checkpoint belongs to
    jobId: {
      type: String,
      required: true,
      index: true,
    },

    // ID of the last processed item (e.g., product ID)
    lastProcessedId: {
      type: String,
      default: "",
    },

    // Current processing stage
    processingStage: {
      type: String,
      required: true,
    },

    // Timestamp when the checkpoint was created
    timestamp: {
      type: Date,
      default: Date.now,
    },

    // Additional metadata for recovery
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    // Don't use timestamps (we have our own timestamp field)
    timestamps: false,

    // Schema options
    versionKey: false,
  }
);

// Create indexes for better performance
CheckpointSchema.index({ jobId: 1, timestamp: -1 });

// Create and export the model
export const Checkpoint = mongoose.model<ICheckpoint>(
  "Checkpoint",
  CheckpointSchema
);
