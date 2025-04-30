export interface ShopifyCredentials {
  shopName: string;
  accessToken: string;
  apiKey?: string;
  apiSecret?: string;
}

// Add shopifyCredentials to Express Request
declare global {
  namespace Express {
    interface Request {
      shopifyCredentials?: ShopifyCredentials;
    }
  }
}

export interface ProductTask {
  productId: string;
  action: string;
  jobId: string;
  shopCredentials: ShopifyCredentials;
  [key: string]: any; // Additional action-specific parameters
}

export interface JobData {
  jobId: string;
  totalProducts: number;
  status: "queued" | "processing" | "completed" | "failed";
  action: string;
  timestamp: Date;
  products?: ProductStatus[];
}

export interface ProductStatus {
  productId: string;
  status: "queued" | "processing" | "completed" | "failed";
  result?: any;
  error?: string;
}

export interface JobStatus {
  jobId: string;
  status: string;
  progress: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
  };
  action: string;
  timestamp: Date;
}

export interface ProductFilters {
  limit?: number;
  collectionId?: string;
  productType?: string;
  tags?: string[];
  vendor?: string;
  createdAtMin?: string;
  createdAtMax?: string;
  updatedAtMin?: string;
  updatedAtMax?: string;
}
