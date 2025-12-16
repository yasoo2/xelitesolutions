"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const mongoose_1 = __importDefault(require("mongoose"));
const pino_1 = __importDefault(require("pino"));
const config_1 = require("./config");
const auth_1 = __importDefault(require("./routes/auth"));
const tools_1 = __importDefault(require("./routes/tools"));
const run_1 = __importDefault(require("./routes/run"));
const runs_1 = __importDefault(require("./routes/runs"));
const sessions_1 = __importDefault(require("./routes/sessions"));
const approvals_1 = __importDefault(require("./routes/approvals"));
const auth_2 = require("./middleware/auth");
const http_1 = __importDefault(require("http"));
const ws_1 = require("./ws");
const fs_1 = __importDefault(require("fs"));
const logger = process.env.NODE_ENV === 'production'
    ? (0, pino_1.default)()
    : (0, pino_1.default)({
        transport: {
            target: 'pino-pretty',
            options: { translateTime: 'SYS:standard', colorize: true },
        },
    });
async function main() {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)({
        origin: (origin, callback) => {
            if (!origin)
                return callback(null, true);
            if (config_1.config.allowedOrigins.includes(origin))
                return callback(null, true);
            return callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
    }));
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use((0, morgan_1.default)('dev'));
    app.get('/health', (_req, res) => res.json({ status: 'OK' }));
    // Auth
    app.use('/auth', auth_1.default);
    app.use('/tools', tools_1.default);
    app.use('/runs', run_1.default);
    app.use('/run', runs_1.default);
    app.use('/sessions', sessions_1.default);
    app.use('/approvals', approvals_1.default);
    // Example protected route
    app.get('/me', auth_2.authenticate, async (req, res) => {
        const auth = req.auth;
        res.json({ userId: auth.sub, role: auth.role });
    });
    const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
    if (!fs_1.default.existsSync(ARTIFACT_DIR)) {
        try {
            fs_1.default.mkdirSync(ARTIFACT_DIR, { recursive: true });
        }
        catch { }
    }
    app.use('/artifacts', express_1.default.static(ARTIFACT_DIR));
    // DB connect (graceful if unavailable locally)
    try {
        await mongoose_1.default.connect(config_1.config.mongoUri, { serverSelectionTimeoutMS: 2000 });
        logger.info('MongoDB connected');
    }
    catch (e) {
        logger.error(e, 'MongoDB connection failed (continuing without DB)');
    }
    const server = http_1.default.createServer(app);
    (0, ws_1.attachWebSocket)(server);
    server.listen(config_1.config.port, () => {
        logger.info({ port: config_1.config.port }, 'API listening');
    });
}
main().catch((err) => {
    logger.error(err, 'Fatal error');
    process.exit(1);
});
