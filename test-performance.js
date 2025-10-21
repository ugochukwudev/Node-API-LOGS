#!/usr/bin/env node

/**
 * Performance test script for API Logger
 * Run this to test query performance improvements
 */

const mongoose = require('mongoose');

// Simple test to check if indexes are working
async function testPerformance() {
    try {
        // Connect to MongoDB (replace with your connection string)
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error('Please set MONGO_URI environment variable');
            return;
        }

        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        // Get the collection
        const db = mongoose.connection.db;
        const collection = db.collection('apilogs');

        // Test 1: Check if indexes exist
        console.log('\n=== Checking Indexes ===');
        const indexes = await collection.indexes();
        console.log('Current indexes:');
        indexes.forEach(idx => {
            console.log(`- ${idx.name}: ${JSON.stringify(idx.key)}`);
        });

        // Test 2: Test query performance
        console.log('\n=== Testing Query Performance ===');
        
        const startTime = Date.now();
        const result = await collection.find({})
            .sort({ date: -1 })
            .limit(20)
            .explain('executionStats');
        
        const endTime = Date.now();
        const executionTime = endTime - startTime;

        console.log(`Query execution time: ${executionTime}ms`);
        console.log(`Documents examined: ${result.executionStats.totalDocsExamined}`);
        console.log(`Index used: ${result.executionStats.executionStages.indexName || 'No index'}`);

        // Test 3: Test count performance
        console.log('\n=== Testing Count Performance ===');
        const countStart = Date.now();
        const count = await collection.countDocuments({});
        const countEnd = Date.now();
        console.log(`Total documents: ${count}`);
        console.log(`Count query time: ${countEnd - countStart}ms`);

        // Test 4: Test aggregation performance
        console.log('\n=== Testing Aggregation Performance ===');
        const aggStart = Date.now();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const aggResult = await collection.aggregate([
            { $match: { date: { $gte: sevenDaysAgo } } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]).maxTimeMS(3000);
        const aggEnd = Date.now();
        console.log(`Aggregation time: ${aggEnd - aggStart}ms`);
        console.log(`Status distribution:`, aggResult);

        console.log('\n=== Performance Test Complete ===');

    } catch (error) {
        console.error('Performance test failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

// Run the test
testPerformance();
