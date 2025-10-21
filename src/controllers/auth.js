"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeUser = exports.getUsers = exports.addUser = exports.logoutUser = exports.loginUser = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const user_model_1 = __importDefault(require("../models/user.model"));
const jwtSecret = process.env.node_api_logger_jwtSecret || "your_secret_key";
const hashPassword = async (password) => {
    const hashedPassword = await bcrypt_1.default.hash(password, 10);
    return hashedPassword;
};
const generateToken = (user, res) => {
    const token = jsonwebtoken_1.default.sign({ id: user._id, role: user.role }, jwtSecret, { expiresIn: '1h' });
    res.cookie('token', token, { httpOnly: true });
    return;
};
const loginUser = async (req, res) => {
    const { email, password } = req.body;
    try {
        let allusers = (await user_model_1.default.find({}));
        if (allusers.length == 0) {
            const hashedPassword = await hashPassword(password);
            const user = new user_model_1.default({ email, password: hashedPassword, role: 'admin' });
            await user.save();
            generateToken(user, res);
            res.json({ message: 'Logged in successfully' });
        }
        let user = await user_model_1.default.findOne({ email });
        if (!user) {
            res.status(400).json({ message: "you're not a user" });
        }
        else {
            if (user.password) {
                const isMatch = await bcrypt_1.default.compare(password, user.password);
                if (!isMatch)
                    return res.status(400).json({ message: 'Invalid credentials' });
                generateToken(user, res);
                res.json({ message: 'Logged in successfully' });
            }
            else {
                const hashedPassword = await hashPassword(password);
                user.password = hashedPassword;
                user.role = "dev";
                await user.save();
                generateToken(user, res);
                res.json({ message: 'Logged in successfully' });
            }
        }
    }
    catch (error) {
        res.status(500).json({ message: `Server error: ${error}` });
    }
};
exports.loginUser = loginUser;
const logoutUser = (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
};
exports.logoutUser = logoutUser;
const addUser = async (req, res) => {
    const { email, password } = req.body;
    // Check if user is admin
    const user = req.user;
    if (user.role !== 'admin') {
        return res.status(403).json({ message: 'Only admins can add users' });
    }
    try {
        // Check if user already exists
        const existingUser = await user_model_1.default.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }
        // Hash password and create user (always as developer)
        const hashedPassword = await hashPassword(password);
        const newUser = new user_model_1.default({
            email,
            password: hashedPassword,
            role: 'dev'
        });
        await newUser.save();
        res.json({ message: 'User added successfully', user: { email, role: 'dev' } });
    }
    catch (error) {
        res.status(500).json({ message: `Server error: ${error}` });
    }
};
exports.addUser = addUser;
const getUsers = async (req, res) => {
    // Check if user is admin
    const user = req.user;
    if (user.role !== 'admin') {
        return res.status(403).json({ message: 'Only admins can view users' });
    }
    try {
        const users = await user_model_1.default.find({}, { password: 0 }); // Exclude password from response
        res.json({ users });
    }
    catch (error) {
        res.status(500).json({ message: `Server error: ${error}` });
    }
};
exports.getUsers = getUsers;
const removeUser = async (req, res) => {
    const { userId } = req.params;
    // Check if user is admin
    const user = req.user;
    if (user.role !== 'admin') {
        return res.status(403).json({ message: 'Only admins can remove users' });
    }
    try {
        // Prevent admin from removing themselves
        if (userId === user.id) {
            return res.status(400).json({ message: 'Cannot remove your own account' });
        }
        const deletedUser = await user_model_1.default.findByIdAndDelete(userId);
        if (!deletedUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ message: 'User removed successfully' });
    }
    catch (error) {
        res.status(500).json({ message: `Server error: ${error}` });
    }
};
exports.removeUser = removeUser;
