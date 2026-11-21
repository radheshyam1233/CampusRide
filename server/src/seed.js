import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { loadConfig } from './config.js';
import { User } from './models/User.js';
import { Listing } from './models/Listing.js';
const config=loadConfig();
if(config.production || !['localhost','127.0.0.1'].some(host=>config.mongoUri.startsWith('mongodb://'+host+':'))) throw new Error('Demo seed is limited to local development databases.');
const email=process.env.SEED_EMAIL,password=process.env.SEED_PASSWORD;
if(!email || !password || password.length<10) throw new Error('Set SEED_EMAIL and SEED_PASSWORD (10+ characters) before seeding.');
await mongoose.connect(config.mongoUri);
try{
 let user=await User.findOne({email});if(!user)user=await User.create({name:'Demo Student',email,passwordHash:await bcrypt.hash(password,12)});
 if(await Listing.exists({owner:user._id})){console.log('Demo owner already has listings; no changes made.');}
 else{await Listing.insertMany([{title:'DEMO — Firefox campus bicycle',category:'Cycle',price:6500},{title:'DEMO — Honda Activa 5G',category:'Scooty',price:38000},{title:'DEMO — Everyday campus cycle',category:'Cycle',price:3200}].map((r,i)=>({...r,owner:user._id,condition:'Good',location:['Limbdi Hostel','Vishweshvarayya Hostel','Rajputana Hostel'][i],description:'This is a demo listing for local testing only. It is not a real vehicle for sale.',contact:email,photos:[]})));console.log('Created 3 clearly labelled demo listings.');}
}finally{await mongoose.disconnect()}
