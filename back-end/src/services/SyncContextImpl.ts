// src/services/SyncContextImpl.ts
import { SyncContext, SyncMetrics } from "../types";
import logger from "../utils/logger";

export class SyncContextImpl implements SyncContext {
  private metrics: SyncMetrics;
  private config: any;
  private metadata: { [key: string]: any };

  constructor(config: any = {}) {
    this.config = config;
    this.metadata = {};
    this.metrics = {
      totalRecords: 0,
      recordsSucceeded: 0,
      recordsFailed: 0,
      progress: 0,
      collectedRecords: {},
      metadata: {},
    };
  }

  recordTotalCount(count: number): void {
    this.metrics.totalRecords = count;
  }

  recordSuccess(count: number = 1): void {
    this.metrics.recordsSucceeded += count;
    this.updateProgressFromCounts();
  }

  recordFailure(count: number = 1): void {
    this.metrics.recordsFailed += count;
    this.updateProgressFromCounts();
  }

  updateProgress(progress: number): void {
    this.metrics.progress = Math.min(progress, 100);
  }

  private updateProgressFromCounts(): void {
    if (this.metrics.totalRecords > 0) {
      const processed =
        this.metrics.recordsSucceeded + this.metrics.recordsFailed;
      this.metrics.progress = Math.min(
        Math.floor((processed / this.metrics.totalRecords) * 100),
        100
      );
    }
  }

  collectRecords(records: any[], modelName: string): void {
    if (!this.metrics.collectedRecords[modelName]) {
      this.metrics.collectedRecords[modelName] = [];
    }

    this.metrics.collectedRecords[modelName].push(...records);
    this.recordSuccess(records.length);
  }

  getConfig(): any {
    return this.config;
  }

  log(
    level: "info" | "error" | "warn" | "debug",
    message: string,
    meta?: any
  ): void {
    logger[level](message, meta);
  }

  getMetrics(): SyncMetrics {
    // Create a copy of the metrics with the current metadata
    return {
      ...this.metrics,
      metadata: this.metadata,
    };
  }

  // Metadata support
  setMetadata(key: string, value: any): void {
    this.metadata[key] = value;
  }

  getMetadata(key: string): any {
    return this.metadata[key];
  }
}
