"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planContext = void 0;
const map = new Map();
exports.planContext = {
    set(approvalId, ctx) { map.set(approvalId, ctx); },
    get(approvalId) { return map.get(approvalId); },
    delete(approvalId) { map.delete(approvalId); }
};
