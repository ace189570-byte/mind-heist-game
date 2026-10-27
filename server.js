'use strict';
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });
const rooms = new Map();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const QUESTIONS = [
  { q: 'What completes the sequence? 4 · 9 · 16 · 25 · ?', choices: ['30','35','36','49'], answer: 2, detail: 'Consecutive squares: 2², 3², 4², 5², 6².', digit: '7' },
  { q: 'The lock says: CAT = 3120. What is DOG?', choices: ['4157','4715','4158','5147'], answer: 0, detail: 'Letters are their alphabet positions: D=4, O=15, G=7.', digit: '4' },
  { q: 'Which binary code represents the number 13?', choices: ['1011','1110','1101','1001'], answer: 2, detail: '13 = 8 + 4 + 1, so its binary representation is 1101.', digit: '9' }
];
const cleanName = s => String(s || '').trim().replace(/[<>]/g, '').slice(0,18);
const codeGen = () => Array.from({length:6}, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
const safe = (fn, socket, cb) => { try { fn(); } catch(e) { if (typeof cb==='function') cb({ok:false,error:'Something went wrong; please try again.'}); else socket.emit('notice','Something went wrong.'); console.error(e); } };
function reply(cb, data) { if(typeof cb === 'function') cb(data); }
function getPlayer(room, token) { return room.players.find(p => p.token === token); }
function publicView(room, token) {
 const p = getPlayer(room, token);
 if(!p) return null;
 const question = room.status==='question' ? QUESTIONS[room.round] : null;
 return {
  code:room.code, status:room.status, host:p.token===room.hostToken, me:p.id,
  players:room.players.map(x=>({id:x.id,name:x.name,online:!!x.socketId,score:x.score,submitted:room.status==='question'&&room.answers.has(x.token)})),
  round:room.round+1, rounds:QUESTIONS.length, endsAt:room.endsAt, successes:room.successes,
  question:question ? {q:question.q, choices:question.choices} : null,
  submitted:room.answers.has(p.token), role:room.status==='lobby' ? null : (p.token===room.agentToken?'DOUBLE AGENT':'CODEBREAKER'),
  signals:room.signals.slice(-5), result:room.lastResult,
  vaultClues:room.clues, winner:room.winner,
  canStart:room.players.length>=2, finalSubmitted:room.finalSubmitted
 };
}
function push(room) {
 room.players.forEach(p=>{ if(p.socketId) { const s=io.sockets.sockets.get(p.socketId); if(s) s.emit('state',publicView(room,p.token)); } });
}
function expire(room) { if(room.timer) clearTimeout(room.timer); room.timer=null; }
function arm(room, ms, fn) { expire(room); room.endsAt=Date.now()+ms; room.timer=setTimeout(()=>{if(rooms.get(room.code)===room)fn(room);},ms); room.timer.unref?.(); }
function enterQuestion(room) {
 room.status='question'; room.answers=new Map(); room.signals=[]; room.lastResult=null;
 arm(room,40000,resolveQuestion); push(room);
}
function resolveQuestion(room) {
 if(room.status!=='question') return;
 expire(room); const q=QUESTIONS[room.round];
 const votes=[0,0,0,0]; room.answers.forEach(a=>votes[a]++);
 const max=Math.max(...votes);
 const winners=votes.map((v,i)=>v===max&&v>0?i:-1).filter(i=>i>=0);
 const majorityCorrect=winners.length===1&&winners[0]===q.answer;
 if(majorityCorrect) room.successes++;
 room.players.forEach(p=>{if(room.answers.get(p.token)===q.answer) p.score+=100;});
 room.clues.push(q.digit);
 room.lastResult={answer:q.answer,detail:q.detail,correct:majorityCorrect,digit:q.digit,votes};
 room.status='reveal'; room.endsAt=Date.now()+9000; arm(room,9000,(r)=>{
   if(r.round<QUESTIONS.length-1){r.round++;enterQuestion(r);} else {r.status='vault';r.finalSubmitted=false;arm(r,35000,endVault);push(r);}
 }); push(room);
}
function endVault(room, succeeded=false) {
 if(room.status!=='vault')return;
 expire(room); room.status='finished'; room.endsAt=null;
 room.winner=(succeeded&&room.successes>=2)?'CODEBREAKERS':'DOUBLE AGENT / VAULT SECURITY';
 room.lastResult={...room.lastResult,agentName:room.players.find(p=>p.token===room.agentToken)?.name||null};
 push(room);
}
function removeFromRoom(socket) {
 const {roomCode, token}=socket.data;
 if(!roomCode||!token)return;
 const room=rooms.get(roomCode); if(!room)return;
 const p=getPlayer(room,token); if(p&&p.socketId===socket.id) p.socketId=null;
 if(room.status==='lobby') {
  room.players=room.players.filter(p=>p.socketId);
  if(!room.players.length){expire(room);rooms.delete(roomCode);return;}
  if(!room.players.some(p=>p.token===room.hostToken))room.hostToken=room.players[0].token;
 }
 push(room);
}
io.on('connection',socket=>{
 socket.on('create',(data,cb)=>safe(()=>{
  const name=cleanName(data?.name);if(!name)return reply(cb,{ok:false,error:'Enter a player name.'});
  removeFromRoom(socket);let code;do{code=codeGen();}while(rooms.has(code));
  const token=crypto.randomBytes(24).toString('hex');
  const room={code,hostToken:token,status:'lobby',players:[{id:crypto.randomUUID(),token,name,score:0,socketId:socket.id}],round:0,answers:new Map(),signals:[],successes:0,clues:[],lastResult:null,agentToken:null,endsAt:null,timer:null,finalSubmitted:false,winner:null,created:Date.now()};
  rooms.set(code,room);socket.data={roomCode:code,token};socket.join(code);reply(cb,{ok:true,code,token});push(room);
 },socket,cb));
 socket.on('join',(data,cb)=>safe(()=>{
  const code=String(data?.code||'').toUpperCase().trim(), name=cleanName(data?.name);
  const room=rooms.get(code);if(!room)return reply(cb,{ok:false,error:'Room not found. Check the code.'});
  if(!name)return reply(cb,{ok:false,error:'Enter a player name.'});
  if(room.status!=='lobby')return reply(cb,{ok:false,error:'This game has already started.'});
  if(room.players.length>=6)return reply(cb,{ok:false,error:'This room is full (6 players).'});
  removeFromRoom(socket);const token=crypto.randomBytes(24).toString('hex');
  const p={id:crypto.randomUUID(),token,name,score:0,socketId:socket.id};room.players.push(p);
  socket.data={roomCode:code,token};socket.join(code);reply(cb,{ok:true,code,token});push(room);
 },socket,cb));
 socket.on('resume',(data,cb)=>safe(()=>{
  const code=String(data?.code||'').toUpperCase(),token=String(data?.token||'');const room=rooms.get(code);
  const p=room&&getPlayer(room,token);if(!p)return reply(cb,{ok:false,error:'Session expired. Join a new room.'});
  removeFromRoom(socket);if(p.socketId&&p.socketId!==socket.id){io.sockets.sockets.get(p.socketId)?.disconnect(true);}
  p.socketId=socket.id;socket.data={roomCode:code,token};socket.join(code);reply(cb,{ok:true,code,token});push(room);
 },socket,cb));
 socket.on('start',(_,cb)=>safe(()=>{
  const r=rooms.get(socket.data.roomCode);if(!r||socket.data.token!==r.hostToken)return reply(cb,{ok:false,error:'Only the host can start.'});
  if(r.status!=='lobby'||r.players.length<2)return reply(cb,{ok:false,error:'At least 2 players required.'});
  r.round=0;r.successes=0;r.clues=[];r.players.forEach(p=>p.score=0);r.agentToken=r.players.length>=4?r.players[crypto.randomInt(r.players.length)].token:null;
  enterQuestion(r);reply(cb,{ok:true});
 },socket,cb));
 socket.on('answer',(data,cb)=>safe(()=>{
  const r=rooms.get(socket.data.roomCode);if(!r||r.status!=='question'||Date.now()>r.endsAt)return reply(cb,{ok:false,error:'This question has closed.'});
  const a=Number(data?.answer);if(!Number.isInteger(a)||a<0||a>3)return reply(cb,{ok:false,error:'Invalid answer.'});
  if(r.answers.has(socket.data.token))return reply(cb,{ok:false,error:'You already answered.'});
  r.answers.set(socket.data.token,a);reply(cb,{ok:true});push(r);
  if(r.answers.size>=r.players.length) resolveQuestion(r);
 },socket,cb));
 socket.on('signal',(data,cb)=>safe(()=>{
  const r=rooms.get(socket.data.roomCode);
  if(!r||r.status!=='question'||r.agentToken!==socket.data.token)return reply(cb,{ok:false,error:'Only an active agent can send a signal.'});
  const p=getPlayer(r,socket.data.token);if(r.signals.some(s=>s.round===r.round))return reply(cb,{ok:false,error:'One signal per round.'});
  const option=Number(data?.option);if(!Number.isInteger(option)||option<0||option>3)return reply(cb,{ok:false,error:'Invalid signal.'});
  r.signals.push({round:r.round,text:`Intercepted transmission: the answer might be ${QUESTIONS[r.round].choices[option]}.`});reply(cb,{ok:true});push(r);
 },socket,cb));
 socket.on('unlock',(data,cb)=>safe(()=>{
  const r=rooms.get(socket.data.roomCode);
  if(!r||r.status!=='vault'||r.finalSubmitted)return reply(cb,{ok:false,error:'Vault is closed.'});
  if(!getPlayer(r,socket.data.token))return reply(cb,{ok:false,error:'Not a player.'});
  r.finalSubmitted=true;const success=String(data?.code||'').trim()==='749';reply(cb,{ok:true,success});endVault(r,success);
 },socket,cb));
 socket.on('replay',(_,cb)=>safe(()=>{
  const r=rooms.get(socket.data.roomCode);
  if(!r||socket.data.token!==r.hostToken||r.status!=='finished')return reply(cb,{ok:false,error:'Only the host may restart a finished game.'});
  r.status='lobby';r.winner=null;r.lastResult=null;r.round=0;r.clues=[];r.endsAt=null;r.agentToken=null;r.successes=0;r.finalSubmitted=false;r.players.forEach(p=>p.score=0);reply(cb,{ok:true});push(r);
 },socket,cb));
 socket.on('disconnect',()=>removeFromRoom(socket));
});
app.use(express.static(path.join(__dirname,'public')));
app.get('/health',(req,res)=>res.json({ok:true,rooms:rooms.size}));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
const sweep=setInterval(()=>{for(const [code,r] of rooms){if(Date.now()-r.created>3*60*60*1000){expire(r);rooms.delete(code);}}},60000);sweep.unref?.();
const port=process.env.PORT||3000;server.listen(port,()=>console.log(`Mind Heist running on http://localhost:${port}`));
