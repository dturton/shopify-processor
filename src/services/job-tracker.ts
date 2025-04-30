import mongoose from "mongoose";
import { JobModel } from "../models/job";
import { JobData, JobStatus, ProductStatus } from "../types";

export class JobTracker {
  static async createJob(jobData: Omit<JobData, "jobId">): Promise<string> {
    const jobId = new mongoose.Types.ObjectId().toString();
    const job = new JobModel({
      jobId,
      ...jobData,
      completedProducts: 0,
      failedProducts: 0,
      products: [],
    });
    await job.save();
    return jobId;
  }

  static async updateProductStatus(
    jobId: string,
    productId: string,
    status: "queued" | "processing" | "completed" | "failed",
    result?: any
  ): Promise<void> {
    const job = await JobModel.findOne({ jobId });
    if (!job) throw new Error(`Job not found: ${jobId}`);

    const productIndex = job.products.findIndex(
      (p) => p.productId === productId
    );

    if (productIndex === -1) {
      // Add product if not exists
      job.products.push({ productId, status, result });
    } else {
      // Update existing product
      job.products[productIndex].status = status;
      if (result !== undefined) {
        if (status === "failed") {
          job.products[productIndex].error = result;
        } else {
          job.products[productIndex].result = result;
        }
      }
    }

    // Update counters
    job.completedProducts = job.products.filter(
      (p) => p.status === "completed"
    ).length;
    job.failedProducts = job.products.filter(
      (p) => p.status === "failed"
    ).length;

    // Update overall job status
    if (job.completedProducts + job.failedProducts === job.totalProducts) {
      job.status = job.failedProducts > 0 ? "failed" : "completed";
    } else if (
      job.status === "queued" &&
      job.products.some((p) => p.status === "processing")
    ) {
      job.status = "processing";
    }

    await job.save();
  }

  static async getJobStatus(jobId: string): Promise<JobStatus> {
    const job = await JobModel.findOne({ jobId });
    if (!job) throw new Error(`Job not found: ${jobId}`);

    return {
      jobId: job.jobId,
      status: job.status,
      progress: {
        total: job.totalProducts,
        completed: job.completedProducts,
        failed: job.failedProducts,
        pending: job.totalProducts - job.completedProducts - job.failedProducts,
      },
      action: job.action,
      timestamp: job.timestamp,
    };
  }

  static async listJobs(limit = 10, skip = 0): Promise<JobStatus[]> {
    const jobs = await JobModel.find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip);

    return jobs.map((job) => ({
      jobId: job.jobId,
      status: job.status,
      progress: {
        total: job.totalProducts,
        completed: job.completedProducts,
        failed: job.failedProducts,
        pending: job.totalProducts - job.completedProducts - job.failedProducts,
      },
      action: job.action,
      timestamp: job.timestamp,
    }));
  }

  static async getJobDetails(jobId: string): Promise<IJob | null> {
    return JobModel.findOne({ jobId });
  }

  static async deleteJob(jobId: string): Promise<boolean> {
    const result = await JobModel.deleteOne({ jobId });
    return result.deletedCount === 1;
  }
}
