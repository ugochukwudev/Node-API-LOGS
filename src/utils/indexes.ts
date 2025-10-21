import mongoose from 'mongoose';
import ApiLog from '../models/apilogs.model';

// Define index types for better TypeScript support
type IndexKey = { [key: string]: 1 | -1 | 'text' };
type IndexConfig = { key: IndexKey; name: string };

/**
 * Creates database indexes for optimal performance
 * Call this function after connecting to MongoDB
 */
export const createIndexes = async () => {
    try {
        console.log('Creating database indexes for optimal performance...');

        // Create indexes one by one to handle conflicts gracefully
        const indexConfigs: IndexConfig[] = [
            { key: { date: -1 }, name: 'date_desc' },
            { key: { date: -1, status: 1 }, name: 'date_desc_status_asc' },
            { key: { endpoint: 1, date: -1 }, name: 'endpoint_asc_date_desc' },
            { key: { status: 1, date: -1 }, name: 'status_asc_date_desc' },
            { key: { responseTime: -1 }, name: 'response_time_desc' },
            { key: { endpoint: 'text' }, name: 'endpoint_text' }
        ];

        for (const config of indexConfigs) {
            try {
                await ApiLog.collection.createIndex(config.key, {
                    name: config.name,
                    background: true
                });
                console.log(`Created index: ${config.name}`);
            } catch (error: any) {
                if (error.code === 85 || error.codeName === 'IndexOptionsConflict') {
                    console.log(`Index ${config.name} already exists or conflicts, skipping...`);
                } else {
                    console.error(`Error creating index ${config.name}:`, error.message);
                }
            }
        }

        console.log('Database index creation completed');

        // Log current index information
        const indexes = await ApiLog.collection.indexes();
        console.log('Current indexes:', indexes.map(idx => ({ name: idx.name, key: idx.key })));

        return true;
    } catch (error) {
        console.error('Error in index creation process:', error);
        return false;
    }
};

/**
 * Checks if indexes exist and creates them if needed
 */
export const ensureIndexes = async () => {
    try {
        console.log('Checking existing indexes...');
        const indexes = await ApiLog.collection.indexes();
        const indexNames = indexes.map(idx => idx.name);

        console.log('Existing indexes:', indexNames);

        // Check if we have the essential indexes
        const hasDateIndex = indexNames.some(name => name && name.includes('date'));
        const hasStatusIndex = indexNames.some(name => name && name.includes('status'));

        if (!hasDateIndex || !hasStatusIndex) {
            console.log('Essential indexes missing, creating them...');
            await createIndexes();
        } else {
            console.log('Essential indexes already exist');
        }

        return true;
    } catch (error) {
        console.error('Error checking indexes:', error);
        // Try to create indexes anyway as fallback
        return await createIndexes();
    }
};
