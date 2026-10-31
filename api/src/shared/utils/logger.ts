import winston from 'winston';
import 'winston-daily-rotate-file';
import { logRotationPolicy } from './log-rotation-policy';

const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

const transport = new winston.transports.DailyRotateFile({
    filename: 'logs/application-%DATE%.log',
    datePattern: 'YYYY-MM-DD-HH',
    maxSize: '20m',
    ...logRotationPolicy(process.env.NODE_ENV)
});

export const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
        transport,
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Stream for external consumption (e.g. WebSocket)
export const logStream = {
    write: (message: string) => {
        logger.info(message.trim());
    }
};
