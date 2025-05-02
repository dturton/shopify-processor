// src/types/index.ts
export interface SyncContext {
  // Methods for tracking metrics
  recordTotalCount(count: number): void;
  recordSuccess(count?: number): void;
  recordFailure(count?: number): void;
  updateProgress(progress: number): void;

  // Methods for data collection
  collectRecords(records: any[], modelName: string): void;

  // Methods for accessing configuration
  getConfig(): any;

  // Logger
  log(
    level: "info" | "error" | "warn" | "debug",
    message: string,
    meta?: any
  ): void;

  // Get the current metrics
  getMetrics(): SyncMetrics;

  // Store and retrieve metadata
  setMetadata(key: string, value: any): void;
  getMetadata(key: string): any;
}

export interface SyncMetrics {
  totalRecords: number;
  recordsSucceeded: number;
  recordsFailed: number;
  progress: number;
  collectedRecords: {
    [modelName: string]: any[];
  };
  metadata?: {
    [key: string]: any;
  };
}
