// Create a new file src/utils/execution-context.ts

import { v4 as uuidv4 } from "uuid";

/**
 * Context manager for execution tracking
 * Provides consistent execution IDs and tracking for jobs
 */
export class ExecutionContext {
  private static instance: ExecutionContext;
  private executions: Map<string, any>;

  private constructor() {
    this.executions = new Map();
  }

  public static getInstance(): ExecutionContext {
    if (!ExecutionContext.instance) {
      ExecutionContext.instance = new ExecutionContext();
    }
    return ExecutionContext.instance;
  }

  /**
   * Create a new execution context
   */
  public createExecution(metadata: any = {}): string {
    const executionId = uuidv4();
    this.executions.set(executionId, {
      executionId,
      startTime: new Date(),
      status: "RUNNING",
      ...metadata,
    });
    return executionId;
  }

  /**
   * Get an execution by ID
   */
  public getExecution(executionId: string): any {
    return this.executions.get(executionId);
  }

  /**
   * Update an execution
   */
  public updateExecution(executionId: string, updates: any): void {
    const execution = this.executions.get(executionId);
    if (execution) {
      this.executions.set(executionId, { ...execution, ...updates });
    }
  }

  /**
   * Complete an execution
   */
  public completeExecution(
    executionId: string,
    status: "COMPLETED" | "FAILED" = "COMPLETED"
  ): void {
    const execution = this.executions.get(executionId);
    if (execution) {
      this.executions.set(executionId, {
        ...execution,
        status,
        endTime: new Date(),
        duration: new Date().getTime() - execution.startTime.getTime(),
      });
    }
  }
}

export default ExecutionContext.getInstance();
