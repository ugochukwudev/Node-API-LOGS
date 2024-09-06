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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
    date: { type: Date, default: Date.now },
});
const ApiLog = mongoose_1.default.model('ApiLog', ApiLogSchema);
exports.default = ApiLog;
//# sourceMappingURL=apilogs.model.js.map