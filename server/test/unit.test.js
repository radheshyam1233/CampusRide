import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig} from '../src/config.js';
import {listingInput} from '../src/routes/listings.js';
import {Listing} from '../src/models/Listing.js';
import {User} from '../src/models/User.js';
import {createApp} from '../src/app.js';
import request from 'supertest';
const config={production:false,secret:'unit-testing-secret-at-least-32-characters',origin:'http://localhost:5173',trustProxy:0,domains:[]};
const valid={title:'A reliable geared campus cycle',category:'Cycle',price:5000,condition:'Good',location:'Limbdi Hostel',description:'A well maintained cycle with working brakes and lights.',contact:'owner@example.com',photos:[]};
test('production configuration enforces secrets and HTTPS and supports Render origin',()=>{
 assert.throws(()=>loadConfig({MONGODB_URI:'mongodb://localhost:27017/test'}),/JWT_SECRET/);
 assert.throws(()=>loadConfig({JWT_SECRET:config.secret,MONGODB_URI:'mongodb://localhost:27017/test',NODE_ENV:'production',APP_ORIGIN:'http://insecure.example'}),/HTTPS/);
 assert.equal(loadConfig({JWT_SECRET:config.secret,MONGODB_URI:'mongodb://localhost:27017/test',NODE_ENV:'production',RENDER_EXTERNAL_URL:'https://campusride.onrender.com'}).origin,'https://campusride.onrender.com');
});
test('listing validation rejects mass assignment and invalid prices or contacts',()=>{
 assert.equal(listingInput.parse(valid).price,5000);
 for(const change of [{owner:'attacker'},{price:-1},{price:1.5},{category:'Car'},{contact:'javascript:alert(1)'},{description:'short'},{photos:['not-an-id']}])assert.equal(listingInput.safeParse({...valid,...change}).success,false);
 assert.equal(listingInput.safeParse({...valid,contact:'+91 9876543210'}).success,true);
});
test('Mongoose user and listing models enforce schema validation without a database',async()=>{
 const user=new User({name:'Student',email:'UPPER@EXAMPLE.COM',passwordHash:'hashed'});await user.validate();assert.equal(user.email,'upper@example.com');
 const invalid=new Listing({...valid,owner:'507f1f77bcf86cd799439011',price:-1});await assert.rejects(invalid.validate(),/price/);
});
test('HTTP layer rejects cross-site requests, unauthenticated writes and invalid identifiers',async()=>{
 const app=createApp(config);
 assert.equal((await request(app).post('/api/auth/login').set('Origin','https://evil.example').send({})).status,403);
 assert.equal((await request(app).post('/api/listings').send(valid)).status,401);
 assert.equal((await request(app).get('/api/listings/invalid')).status,404);
 assert.equal((await request(app).post('/api/auth/signup').send({name:'A',email:'bad',password:'short'})).status,400);
 assert.equal((await request(app).get('/api/unknown')).status,404);
 assert.equal((await request(app).get('/api/health')).status,503);
});
