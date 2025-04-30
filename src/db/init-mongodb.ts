// src/db/init-mongodb.ts

import mongoose from "mongoose";

/**
 * Initializes the MongoDB database with required collections and indexes
 */
export async function initializeDatabase(): Promise<void> {
  try {
    // Check if connection is established
    if (mongoose.connection.readyState !== 1) {
      return;
    }

    // Get the connection to work with
    const db = mongoose.connection;

    const collections = await db.db.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name);

    // Create jobs collection if it doesn't exist
    if (!collectionNames.includes("jobs")) {
      await db.createCollection("jobs", {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: [
              "jobId",
              "totalProducts",
              "status",
              "action",
              "timestamp",
            ],
            properties: {
              jobId: {
                bsonType: "string",
                description: "Must be a string and is required",
              },
              totalProducts: {
                bsonType: "number",
                minimum: 0,
                description: "Must be a number >= 0 and is required",
              },
              completedProducts: {
                bsonType: "number",
                minimum: 0,
                description: "Must be a number >= 0",
              },
              failedProducts: {
                bsonType: "number",
                minimum: 0,
                description: "Must be a number >= 0",
              },
              status: {
                enum: ["queued", "processing", "completed", "failed"],
                description:
                  "Can only be one of the enum values and is required",
              },
              action: {
                bsonType: "string",
                description: "Must be a string and is required",
              },
              timestamp: {
                bsonType: "date",
                description: "Must be a date and is required",
              },
            },
          },
        },
      });
    } else {
      // Get the jobs collection
      const jobsCollection = db.collection("jobs");

      // Create indexes
      await jobsCollection.createIndex({ jobId: 1 }, { unique: true });
      await jobsCollection.createIndex({ timestamp: -1 });
      await jobsCollection.createIndex({ status: 1 });

      // Insert test data if collection is empty
      const count = await jobsCollection.countDocuments();

      if (count === 0) {
        await jobsCollection.insertOne({
          jobId: "test-job-1",
          totalProducts: 3,
          completedProducts: 1,
          failedProducts: 0,
          status: "processing",
          action: "updateTags",
          timestamp: new Date(),
          products: [
            { productId: "123456789", status: "completed" },
            { productId: "987654321", status: "queued" },
            { productId: "456789123", status: "processing" },
          ],
        });
      }
    }
  } catch (error) {
    console.error("Error initializing database:", error);
    throw new Error("Database initialization failed");
  }
}
