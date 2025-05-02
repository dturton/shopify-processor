# Shopify Product Sync Queue Testing Guide

This guide explains how to test the product synchronization queue system and interpret the results.

## Issue Overview

The current sync queue implementation has a few issues:

1. The `batchJobs` handling seems to be inconsistent between array-based and object-based formats
2. The output shows that jobs aren't being marked as completed properly
3. The sync state isn't being updated correctly in some cases

## Testing Strategy

The test script helps validate that the sync queue is working correctly:

1. **Initialization Test**: Verifies the workers can be initialized
2. **Queue Processing Test**: Runs a full sync job and checks the state
3. **Cleanup Test**: Tests the detection and reset of stuck jobs

## Running Tests

1. First, make sure the mock Shopify API is in place: