"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const api_1 = require("../controllers/api");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
router.get('/logs', auth_1.verifyToken, api_1.getLogs);
router.get('/logs/:id', auth_1.verifyToken, api_1.getLogById);
exports.default = router;
//# sourceMappingURL=api.js.map