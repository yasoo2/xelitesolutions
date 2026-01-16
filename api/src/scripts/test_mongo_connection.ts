/**
 * MongoDB Connection Test Script
 * Tests connection to remote MongoDB server
 */

export { };
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function testMongoConnection() {
    console.log('🔍 Testing MongoDB Connection...\n');

    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/joe';
    console.log(`📡 Connecting to: ${mongoUri.replace(/:\/\/.*@/, '://***@')}\n`);

    try {
        console.log('⏳ Connecting...');
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 10000,
        });

        console.log('✅ Connected successfully!\n');

        // Test database operations
        console.log('🧪 Testing database operations...');

        // List databases
        if (!mongoose.connection.db) throw new Error("DB connection not established");
        const admin = mongoose.connection.db.admin();
        const { databases } = await admin.listDatabases();
        console.log(`\n📚 Available databases: ${databases.map((db: any) => db.name).join(', ')}`);

        // Check collections in current database
        const collections = await mongoose.connection.db!.listCollections().toArray();
        console.log(`\n📦 Collections in 'joe' database: ${collections.length}`);
        if (collections.length > 0) {
            collections.forEach((col: any) => {
                console.log(`   - ${col.name}`);
            });
        }

        // Test insert
        console.log('\n🔬 Testing write operation...');
        const testCol = mongoose.connection.db!.collection('connection_test');
        const result = await testCol.insertOne({
            test: true,
            timestamp: new Date(),
            message: 'Connection test successful',
        });
        console.log(`✅ Write test successful (ID: ${result.insertedId})`);

        // Clean up test
        await testCol.deleteOne({ _id: result.insertedId });
        console.log('🧹 Cleaned up test data');

        console.log('\n╔════════════════════════════════════════════╗');
        console.log('║   MongoDB Connection: ✅ SUCCESS           ║');
        console.log('╚════════════════════════════════════════════╝');

        await mongoose.disconnect();
        process.exit(0);

    } catch (error: any) {
        console.error('\n❌ Connection failed!');
        console.error(`Error: ${error.message}\n`);

        if (error.message.includes('ECONNREFUSED')) {
            console.log('💡 Possible issues:');
            console.log('   1. MongoDB server is not running');
            console.log('   2. Firewall is blocking port 27017');
            console.log('   3. Incorrect host/port in MONGO_URI');
        } else if (error.message.includes('Authentication failed')) {
            console.log('💡 Authentication issue:');
            console.log('   Check username/password in MONGO_URI');
        } else if (error.message.includes('timeout')) {
            console.log('💡 Connection timeout:');
            console.log('   1. Check network connectivity');
            console.log('   2. Verify firewall rules');
            console.log('   3. Ensure MongoDB is accessible from this machine');
        }

        console.log('\n╔════════════════════════════════════════════╗');
        console.log('║   MongoDB Connection: ❌ FAILED            ║');
        console.log('╚════════════════════════════════════════════╝');

        process.exit(1);
    }
}

testMongoConnection();
