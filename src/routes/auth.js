"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../controllers/auth");
const auth_2 = require("../middleware/auth");
const router = express_1.default.Router();
router.post('/login', auth_1.loginUser);
router.post('/logout', auth_1.logoutUser);
router.post('/add-user', auth_2.verifyToken, auth_1.addUser);
router.get('/users', auth_2.verifyToken, auth_1.getUsers);
router.delete('/users/:userId', auth_2.verifyToken, auth_1.removeUser);
exports.default = router;
