import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import User from '../models/user.model';

export const loginUser = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    try {
        let allusers = (await User.find({}));
        if(allusers.length==0){
//create first user
const hashedPassword = await bcrypt.hash(password, 10);
            const user = new User({ email, password: hashedPassword, role: 'admin' });
            await user.save();
            const token = jwt.sign({ id: user._id, role: user.role }, 'your_secret_key', { expiresIn: '1h' });
            res.cookie('token', token, { httpOnly: true });
            res.json({ message: 'Logged in successfully' });
        }
        let user = await User.findOne({ email });
        if (!user) {
            res.status(400).json({message:"you're not a user"})
        } else {
            if(user.password){
                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
                const token = jwt.sign({ id: user._id, role: user.role }, 'your_secret_key', { expiresIn: '1h' });
            res.cookie('token', token, { httpOnly: true });
            res.json({ message: 'Logged in successfully' });
            }else{
                const hashedPassword = await bcrypt.hash(password, 10);
            user.password = hashedPassword;
            user.role = "dev";
            await user.save();
            const token = jwt.sign({ id: user._id, role: user.role }, 'your_secret_key', { expiresIn: '1h' });
            res.cookie('token', token, { httpOnly: true });
            res.json({ message: 'Logged in successfully' });
            }
           
        }
    } catch (error) {
        res.status(500).json({ message: `Server error: ${error}` });
    }
};
