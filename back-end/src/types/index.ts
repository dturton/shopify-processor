// src/types/index.ts
export interface SyncContext {
  // Methods for tracking metrics
  recordTotalCount(count: number): void;
  recordSuccess(count?: number): void;
  recordFailure(count?: number): void;
  updateProgress(progress: number): void;
  filters: ProductFilters;
  credentials: ShopifyCredentials;
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

// Add these to your src/types/index.ts file

export interface ShopifyCredentials {
  shopName: string;
  accessToken: string;
  filters?: ProductFilters;
}

export interface ProductFilters {
  productType?: string;
  vendor?: string;
  createdAtMin?: string;
  createdAtMax?: string;
  updatedAtMin?: string;
  updatedAtMax?: string;
  [key: string]: string | undefined;
}
