"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginUser = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const user_model_1 = __importDefault(require("../models/user.model"));
const loginUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password } = req.body;
    try {
        let allusers = (yield user_model_1.default.find({}));
        if (allusers.length == 0) {
            //create first user
            const hashedPassword = yield bcrypt_1.default.hash(password, 10);
            const user = new user_model_1.default({ email, password: hashedPassword, role: 'admin' });
            yield user.save();
            const token = jsonwebtoken_1.default.sign({ id: user._id, role: user.role }, 'your_secret_key', { expiresIn: '1h' });
            res.cookie('token', token, { httpOnly: true });
            res.json({ message: 'Logged in successfully' });
        }
        let user = yield user_model_1.default.findOne({ email });
        if (!user) {
            res.status(400).json({ message: "you're not a user" });
        }
        else {
            if (user.password) {
                const isMatch = yield bcrypt_1.default.compare(password, user.password);
                if (!isMatch)
                    return res.status(400).json({ message: 'Invalid credentials' });
                const token = jsonwebtoken_1.default.sign({ id: user._id, role: user.role }, 'your_secret_key', { expiresIn: '1h' });
                res.cookie('token', token, { httpOnly: true });
                res.json({ message: 'Logged in successfully' });
            }
            else {
                const hashedPassword = yield bcrypt_1.default.hash(password, 10);
                user.password = hashedPassword;
                user.role = "dev";
                yield user.save();
                const token = jsonwebtoken_1.default.sign({ id: user._id, role: user.role }, 'your_secret_key', { expiresIn: '1h' });
                res.cookie('token', token, { httpOnly: true });
                res.json({ message: 'Logged in successfully' });
            }
        }
    }
    catch (error) {
        res.status(500).json({ message: `Server error: ${error}` });
    }
});
exports.loginUser = loginUser;
//# sourceMappingURL=auth.js.map