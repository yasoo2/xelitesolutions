/**
 * Server Management API Routes
 * CRUD operations for SSH server configurations
 */

import { Router } from 'express';
import { ServerConfigModel } from '../models/ServerConfigModel';
import { sshManager } from '../terminal/ssh-manager';
import { ServerConfig } from '../models/ServerConfig';

const router = Router();

/**
 * GET /api/servers
 * List all servers for user
 */
router.get('/', async (req, res) => {
    try {
        const userId = (req as any).auth?.sub;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const servers = await ServerConfigModel.find({ userId, isActive: true });

        // Add connection status
        const serversWithStatus = servers.map(server => {
            const doc = server as any;
            return {
                ...doc.toObject(),
                id: doc._id.toString(),
                connectionStatus: sshManager.getStatus(doc._id.toString()),
            };
        });

        res.json(serversWithStatus);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/servers
 * Add new server configuration
 */
router.post('/', async (req, res) => {
    try {
        const userId = (req as any).auth?.sub;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const serverData = {
            ...req.body,
            userId,
            createdAt: new Date(),
        };

        const server = await ServerConfigModel.create(serverData);

        const doc = server as any;
        res.status(201).json({
            ...doc.toObject(),
            id: doc._id.toString(),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * PUT /api/servers/:id
 * Update server configuration
 */
router.put('/:id', async (req, res) => {
    try {
        const userId = (req as any).auth?.sub;
        const { id } = req.params;

        const server = await ServerConfigModel.findOneAndUpdate(
            { _id: id, userId },
            { $set: req.body },
            { new: true }
        );

        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        const doc = server as any;
        res.json({
            ...doc.toObject(),
            id: doc._id.toString(),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * DELETE /api/servers/:id
 * Soft delete server (set isActive = false)
 */
router.delete('/:id', async (req, res) => {
    try {
        const userId = (req as any).auth?.sub;
        const { id } = req.params;

        // Disconnect if connected
        if (sshManager.isConnected(id)) {
            await sshManager.disconnect(id);
        }

        const server = await ServerConfigModel.findOneAndUpdate(
            { _id: id, userId },
            { $set: { isActive: false } },
            { new: true }
        );

        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        res.json({ message: 'Server deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/servers/:id/connect
 * Connect to server via SSH
 */
router.post('/:id/connect', async (req, res) => {
    try {
        const userId = (req as any).auth?.sub;
        const { id } = req.params;

        const server = await ServerConfigModel.findOne({ _id: id, userId }).select('+password');
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        const serverConfig: ServerConfig = {
            id: server._id.toString(),
            name: server.name,
            host: server.host,
            port: server.port,
            username: server.username,
            authMethod: server.authMethod,
            keyPath: server.keyPath,
            password: server.password,
            tags: server.tags,
            isActive: server.isActive,
            lastConnected: server.lastConnected,
            createdAt: server.createdAt,
            userId: server.userId.toString(),
        };

        await sshManager.connect(serverConfig);

        // Update last connected
        await ServerConfigModel.updateOne(
            { _id: id },
            { $set: { lastConnected: new Date() } }
        );

        res.json({
            message: 'Connected successfully',
            status: sshManager.getStatus(id),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/servers/:id/disconnect
 * Disconnect from server
 */
router.post('/:id/disconnect', async (req, res) => {
    try {
        const { id } = req.params;
        await sshManager.disconnect(id);

        res.json({ message: 'Disconnected successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/servers/:id/test
 * Test server connection without keeping it open
 */
router.post('/:id/test', async (req, res) => {
    try {
        const userId = (req as any).auth?.sub;
        const { id } = req.params;

        const server = await ServerConfigModel.findOne({ _id: id, userId }).select('+password');
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        const serverConfig: ServerConfig = {
            id: server._id.toString(),
            name: server.name,
            host: server.host,
            port: server.port,
            username: server.username,
            authMethod: server.authMethod,
            keyPath: server.keyPath,
            password: server.password,
            tags: server.tags,
            isActive: server.isActive,
            lastConnected: server.lastConnected,
            createdAt: server.createdAt,
            userId: server.userId.toString(),
        };

        const isConnectable = await sshManager.testConnection(serverConfig);

        res.json({ success: isConnectable });
    } catch (error: any) {
        res.status(500).json({ error: error.message, success: false });
    }
});

export default router;
