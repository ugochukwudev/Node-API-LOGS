import mongoose from 'mongoose';

const connectMongo = async (uri: string, name?:string) => {
  if (mongoose.connections[0].readyState) {
    return;
  }
  await mongoose.connect(uri, {
   appName:name||"applog"
  });
};

export default connectMongo;
