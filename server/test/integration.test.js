import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Listing } from '../src/models/Listing.js';
import { Photo } from '../src/models/Photo.js';
let mongo, app;
const config={production:false,secret:'test-only-secret-that-is-more-than-thirty-two-characters',origin:'http://localhost:5173',trustProxy:0,domains:[]};
const ride={title:'Firefox campus bicycle',category:'Cycle',price:6500,condition:'Good',location:'Limbdi Hostel',description:'Well maintained 21-speed cycle with a new chain and working brakes.',contact:'seller@example.com',photos:[]};
before(async()=>{mongo=await MongoMemoryServer.create({ instance: { args: process.platform === 'win32' ? [] : ['--nounixsocket'] } });await mongoose.connect(mongo.getUri());await Promise.all([User.init(),Session.init(),Listing.init(),Photo.init()]);app=createApp(config)});
after(async()=>{await mongoose.disconnect();await mongo?.stop()});
async function account(name,email){const agent=request.agent(app);const res=await agent.post('/api/auth/signup').send({name,email,password:'a-strong-password-123'});assert.equal(res.status,201,JSON.stringify(res.body));return{agent,csrf:res.body.csrf,id:res.body.user.id,cookie:res.headers['set-cookie'][0].split(';')[0]}}
test('signup hashes passwords, rejects duplicate email, and protects account endpoints',async()=>{
 const {agent}=await account('First Student','first@example.com');
 const user=await User.findOne({email:'first@example.com'}).select('+passwordHash');assert.notEqual(user.passwordHash,'a-strong-password-123');
 const me=await agent.get('/api/auth/me');assert.equal(me.status,200);assert.ok(me.body.csrf);assert.equal(me.body.user.passwordHash,undefined);
 assert.equal((await request(app).get('/api/auth/me')).status,401);
 assert.equal((await request(app).post('/api/auth/signup').send({name:'Other',email:'first@example.com',password:'a-strong-password-123'})).status,409);
 assert.equal((await request(app).post('/api/auth/login').send({email:'first@example.com',password:'wrong'})).status,401);
 assert.equal((await request(app).post('/api/auth/login').send({email:'first@example.com',password:'a-strong-password-123'})).status,200);
});
test('listing CRUD, ownership authorization, contact privacy, and session revocation',async()=>{
 const owner=await account('Owner','owner@example.com'),other=await account('Other','other@example.com');
 assert.equal((await request(app).post('/api/listings').send(ride)).status,401);
 assert.equal((await owner.agent.post('/api/listings').send(ride)).status,403);
 const create=await owner.agent.post('/api/listings').set('X-CSRF-Token',owner.csrf).send(ride);assert.equal(create.status,201,JSON.stringify(create.body));const id=create.body.listing.id;
 assert.equal((await request(app).get('/api/listings')).body.listings[0].contact,undefined);
 assert.equal((await request(app).get('/api/listings/'+id)).status,401);
 assert.equal((await other.agent.get('/api/listings/'+id)).body.listing.contact,'seller@example.com');
 assert.equal((await other.agent.patch('/api/listings/'+id).set('X-CSRF-Token',other.csrf).send({price:1})).status,404);
 assert.equal((await other.agent.delete('/api/listings/'+id).set('X-CSRF-Token',other.csrf)).status,404);
 assert.equal((await owner.agent.patch('/api/listings/'+id).set('X-CSRF-Token',owner.csrf).send({owner:other.id})).status,400);
 const edit=await owner.agent.patch('/api/listings/'+id).set('X-CSRF-Token',owner.csrf).send({price:6000,status:'sold'});assert.equal(edit.status,200);assert.equal(edit.body.listing.price,6000);
 assert.equal((await request(app).get('/api/listings')).body.total,0);
 assert.equal((await owner.agent.get('/api/listings/mine')).body.listings.length,1);
 assert.equal((await owner.agent.delete('/api/listings/'+id).set('X-CSRF-Token',owner.csrf)).status,204);
 assert.equal((await owner.agent.get('/api/listings/'+id)).status,404);
 assert.equal((await owner.agent.post('/api/auth/logout').set('X-CSRF-Token',owner.csrf)).status,200);
 assert.equal((await request(app).get('/api/auth/me').set('Cookie',owner.cookie)).status,401);
});
test('server validates filters, input and origin; search treats regex characters literally',async()=>{
 const owner=await account('Filter Owner','filter@example.com');
 assert.equal((await owner.agent.post('/api/listings').set('X-CSRF-Token',owner.csrf).set('Origin','https://evil.example').send(ride)).status,403);
 assert.equal((await owner.agent.post('/api/listings').set('X-CSRF-Token',owner.csrf).send({...ride,price:-1})).status,400);
 await owner.agent.post('/api/listings').set('X-CSRF-Token',owner.csrf).send({...ride,title:'Firefox [21] geared cycle'});
 const search=await request(app).get('/api/listings').query({search:'[21]',maxPrice:7000});assert.equal(search.status,200);assert.equal(search.body.total,1);
 assert.equal((await request(app).get('/api/listings?category=Car')).status,400);
 assert.equal((await request(app).get('/api/listings?page=-1')).status,400);
 assert.equal((await owner.agent.get('/api/listings/not-an-id')).status,404);
});
test('photos are decoded, ownership checked, attached durably and removed on listing deletion',async()=>{
 const owner=await account('Photo Owner','photos@example.com'),other=await account('Photo Other','photo-other@example.com');
 const buffer=await sharp({create:{width:40,height:40,channels:3,background:'#225533'}}).jpeg().toBuffer();
 const uploaded=await owner.agent.post('/api/photos').set('X-CSRF-Token',owner.csrf).attach('photo',buffer,'ride.jpg');assert.equal(uploaded.status,201,JSON.stringify(uploaded.body));const photo=uploaded.body.id;
 assert.equal((await request(app).get('/api/photos/'+photo)).headers['content-type'],'image/webp');
 assert.equal((await other.agent.post('/api/listings').set('X-CSRF-Token',other.csrf).send({...ride,photos:[photo]})).status,400);
 const create=await owner.agent.post('/api/listings').set('X-CSRF-Token',owner.csrf).send({...ride,photos:[photo]});assert.equal(create.status,201);
 const doc=await Photo.findById(photo).lean();assert.equal(doc.expiresAt,undefined);assert.equal(String(doc.listing),create.body.listing.id);
 const path = '/api/listings/' + create.body.listing.id;
 const emptyPatch = await owner.agent.patch(path).set('X-CSRF-Token', owner.csrf).send({});
 assert.equal(emptyPatch.status, 400);
 const sold = await owner.agent.patch(path).set('X-CSRF-Token', owner.csrf).send({ status: 'sold' });
 assert.equal(sold.status, 200);
 assert.deepEqual(sold.body.listing.photos, [photo]);
 await owner.agent.delete(path).set('X-CSRF-Token',owner.csrf);assert.equal((await request(app).get('/api/photos/'+photo)).status,404);
 const invalid=await owner.agent.post('/api/photos').set('X-CSRF-Token',owner.csrf).attach('photo',Buffer.from('not an image'),'fake.jpg');assert.equal(invalid.status,400);
});

test('a separate browser receives live signals after listing creation, updates and deletion', async () => {
  const owner = await account('Live Seller', 'live-seller@example.com');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/listings`;
  const controller = new AbortController();
  try {
    const response = await fetch(url + '/events', {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/event-stream(?:;|$)/i);
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffered = '';

    async function readEvent() {
      while (!buffered.includes('\n\n')) {
        const { done, value } = await reader.read();
        assert.equal(done, false);
        buffered += value;
      }
      const eventEnd = buffered.indexOf('\n\n');
      const event = buffered.slice(0, eventEnd);
      buffered = buffered.slice(eventEnd + 2);
      return event;
    }

    assert.equal(await readEvent(), ': connected');
    const created = await owner.agent.post('/api/listings')
      .set('X-CSRF-Token', owner.csrf).send(ride);
    assert.equal(created.status, 201);
    assert.equal(await readEvent(), 'event: listings-updated\ndata: {}');
    const id = created.body.listing.id;
    const updated = await owner.agent.patch('/api/listings/' + id)
      .set('X-CSRF-Token', owner.csrf).send({ status: 'sold' });
    assert.equal(updated.status, 200);
    assert.equal(await readEvent(), 'event: listings-updated\ndata: {}');
    const browse = await fetch(url).then(response => response.json());
    assert.ok(browse.listings.every(listing => listing.id !== id));
    const deleted = await owner.agent.delete('/api/listings/' + id)
      .set('X-CSRF-Token', owner.csrf);
    assert.equal(deleted.status, 204);
    assert.equal(await readEvent(), 'event: listings-updated\ndata: {}');
  } finally {
    controller.abort();
    await new Promise(resolve => server.close(resolve));
  }
});
