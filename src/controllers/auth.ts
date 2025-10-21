import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import User from '../models/user.model';
import { Document } from 'mongoose';

interface UserSchema {
    role: 'admin' | 'dev';
    email: string;
    password: string;
}

const jwtSecret = process.env.node_api_logger_jwtSecret || "your_secret_key";
const hashPassword = async (password: string) => {
    const hashedPassword = await bcrypt.hash(password, 10);
    return hashedPassword;
}

const generateToken = (user: Document<unknown, {}, UserSchema> & UserSchema, res: Response) => {
    const token = jwt.sign({ id: user._id, role: user.role }, jwtSecret, { expiresIn: '1h' });
    res.cookie('token', token, { httpOnly: true });
    return;
}

export const loginUser = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    try {
        let allusers = (await User.find({}));
        if (allusers.length == 0) {
            const hashedPassword = await hashPassword(password);
            const user = new User({ email, password: hashedPassword, role: 'admin' });
            await user.save();
            generateToken(user, res);
            res.json({ message: 'Logged in successfully' });
        }
        let user = await User.findOne({ email });
        if (!user) {
            res.status(400).json({ message: "you're not a user" })
        } else {
            if (user.password) {
                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
                generateToken(user, res);
                res.json({ message: 'Logged in successfully' });
            } else {
                const hashedPassword = await hashPassword(password);
                user.password = hashedPassword;
                user.role = "dev";
                await user.save();
                generateToken(user, res);
                res.json({ message: 'Logged in successfully' });
            }

        }
    } catch (error) {
        res.status(500).json({ message: `Server error: ${error}` });
    }
};

export const logoutUser = (req: Request, res: Response) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
};

export const addUser = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // Check if user is admin
    const user = (req as any).user;
    if (user.role !== 'admin') {
        return res.status(403).json({ message: 'Only admins can add users' });
    }

    try {
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }

        // Hash password and create user (always as developer)
        const hashedPassword = await hashPassword(password);
        const newUser = new User({
            email,
            password: hashedPassword,
            role: 'dev'
        });

        await newUser.save();
        res.json({ message: 'User added successfully', user: { email, role: 'dev' } });
    } catch (error) {
        res.status(500).json({ message: `Server error: ${error}` });
    }
};

export const getUsers = async (req: Request, res: Response) => {
    // Check if user is admin
    const user = (req as any).user;
    if (user.role !== 'admin') {
        return res.status(403).json({ message: 'Only admins can view users' });
    }

    try {
        const users = await User.find({}, { password: 0 }); // Exclude password from response
        res.json({ users });
    } catch (error) {
        res.status(500).json({ message: `Server error: ${error}` });
    }
};

export const removeUser = async (req: Request, res: Response) => {
    const { userId } = req.params;

    // Check if user is admin
    const user = (req as any).user;
    if (user.role !== 'admin') {
        return res.status(403).json({ message: 'Only admins can remove users' });
    }

    try {
        // Prevent admin from removing themselves
        if (userId === user.id) {
            return res.status(400).json({ message: 'Cannot remove your own account' });
        }

        const deletedUser = await User.findByIdAndDelete(userId);
        if (!deletedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User removed successfully' });
    } catch (error) {
        res.status(500).json({ message: `Server error: ${error}` });
    }
};

