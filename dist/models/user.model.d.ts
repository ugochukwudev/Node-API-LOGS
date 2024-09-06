import { Schema } from 'mongoose';
declare const User: import("mongoose").Model<{
    role: "admin" | "dev";
    email: string;
    password: string;
}, {}, {}, {}, import("mongoose").Document<unknown, {}, {
    role: "admin" | "dev";
    email: string;
    password: string;
}> & {
    role: "admin" | "dev";
    email: string;
    password: string;
} & {
    _id: import("mongoose").Types.ObjectId;
}, Schema<any, import("mongoose").Model<any, any, any, any, any, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, {
    role: "admin" | "dev";
    email: string;
    password: string;
}, import("mongoose").Document<unknown, {}, import("mongoose").FlatRecord<{
    role: "admin" | "dev";
    email: string;
    password: string;
}>> & import("mongoose").FlatRecord<{
    role: "admin" | "dev";
    email: string;
    password: string;
}> & {
    _id: import("mongoose").Types.ObjectId;
}>>;
export default User;
//# sourceMappingURL=user.model.d.ts.map