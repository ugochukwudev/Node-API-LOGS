"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const ApiLogSchema = new mongoose_1.Schema({
    method: { type: String, required: true },
    endpoint: { type: String, required: true },
    status: { type: Number, required: true },
    responseTime: { type: Number, required: true },
    requestBody: { type: mongoose_1.Schema.Types.Mixed, required: true },
    responseBody: { type: mongoose_1.Schema.Types.Mixed, required: true }, // Ensure this allows objects
    headers: { type: mongoose_1.Schema.Types.Mixed, required: true },
    ip: { type: String, required: true },
    date: { type: Date, default: Date.now, index: true },
    sessionLogs: { type: [mongoose_1.Schema.Types.Mixed], default: [] },
});
// Add compound indexes for better query performance
ApiLogSchema.index({ date: -1, status: 1 }); // For filtering by date and status
ApiLogSchema.index({ endpoint: 1, date: -1 }); // For endpoint filtering with date sorting
ApiLogSchema.index({ status: 1, date: -1 }); // For status filtering with date sorting
ApiLogSchema.index({ responseTime: -1 }); // For finding slow endpoints
ApiLogSchema.index({ date: -1 }); // For general date-based queries (already exists but explicit)
const ApiLog = mongoose_1.default.model('ApiLog', ApiLogSchema);
exports.default = ApiLog;
