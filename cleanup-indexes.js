#!/usr/bin/env node

/**
 * Cleanup script to remove conflicting indexes before creating new ones
 * Run this if you're getting index conflicts
 */

const mongoose = require('mongoose');

async function cleanupIndexes() {
    try {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error('Please set MONGO_URI environment variable');
            return;
        }

        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        const collection = db.collection('apilogs');

        // Get all indexes
        const indexes = await collection.indexes();
        console.log('Current indexes:');
        indexes.forEach(idx => {
            console.log(`- ${idx.name}: ${JSON.stringify(idx.key)}`);
        });

        // Remove conflicting auto-created indexes
        const indexesToRemove = indexes.filter(idx => 
            idx.name && (
                idx.name.includes('autocreated') ||
                idx.name.includes('date_-1_autocreated') ||
                (idx.name.startsWith('date_') && idx.name !== 'date_desc')
            )
        );

        if (indexesToRemove.length > 0) {
            console.log('\nRemoving conflicting indexes:');
            for (const index of indexesToRemove) {
                try {
                    await collection.dropIndex(index.name);
                    console.log(`Removed: ${index.name}`);
                } catch (error) {
                    console.log(`Could not remove ${index.name}: ${error.message}`);
                }
            }
        } else {
            console.log('\nNo conflicting indexes found');
        }

        console.log('\nCleanup completed. You can now restart your application.');

    } catch (error) {
        console.error('Cleanup failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

cleanupIndexes();
