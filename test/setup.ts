import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createIndexes } from "../src/utils/indexes";

let mongoServer: MongoMemoryServer | null = null;

// Only setup database if tests need it
const needsDatabase = process.env.TEST_NEEDS_DB !== "false";

if (needsDatabase) {
	// Setup before all tests
	beforeAll(async () => {
		try {
			mongoServer = await MongoMemoryServer.create({
				instance: {
					dbName: "test-db",
				},
				binary: {
					version: "7.0.0",
				},
			});
			const mongoUri = mongoServer.getUri();
			await mongoose.connect(mongoUri, {
				serverSelectionTimeoutMS: 30000,
			});
			// Create indexes for tests
			await createIndexes();
		} catch (error) {
			console.error("Failed to start MongoDB Memory Server:", error);
			throw error;
		}
	}, 120000);

	// Cleanup after each test
	afterEach(async () => {
		if (mongoose.connection.readyState === 1) {
			const collections = mongoose.connection.collections;
			for (const key in collections) {
				await collections[key].deleteMany({});
			}
		}
	});

	// Teardown after all tests
	afterAll(async () => {
		if (mongoose.connection.readyState === 1) {
			await mongoose.connection.dropDatabase();
			await mongoose.connection.close();
		}
		if (mongoServer) {
			await mongoServer.stop();
		}
	}, 30000);
}

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-for-jwt";
