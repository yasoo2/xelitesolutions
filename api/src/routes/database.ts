import { Router } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth';

const router = Router();

// Middleware to ensure DB is connected
router.use((req, res, next) => {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
        return res.status(503).json({ error: 'Database not connected' });
    }
    next();
});

// List all collections
router.get('/', authenticate, async (req, res) => {
    try {
        const collections = await mongoose.connection.db!.listCollections().toArray();
        const names = collections.map(c => c.name).sort();
        res.json({ collections: names });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get documents from a collection
router.get('/:collection', authenticate, async (req, res) => {
    try {
        const { collection } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const query = req.query.q ? JSON.parse(req.query.q as string) : {};

        const coll = mongoose.connection.db!.collection(collection);
        const total = await coll.countDocuments(query);
        const docs = await coll.find(query)
            .skip((page - 1) * limit)
            .limit(limit)
            .toArray();

        res.json({
            data: docs,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update a document
router.put('/:collection/:id', authenticate, async (req, res) => {
    try {
        const { collection, id } = req.params;
        const update = req.body;
        
        // Remove _id from update if present to avoid immutable field error
        delete update._id;

        const coll = mongoose.connection.db!.collection(collection);
        const result = await coll.updateOne(
            { _id: new mongoose.Types.ObjectId(id) },
            { $set: update }
        );

        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a document
router.delete('/:collection/:id', authenticate, async (req, res) => {
    try {
        const { collection, id } = req.params;
        const coll = mongoose.connection.db!.collection(collection);
        const result = await coll.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
