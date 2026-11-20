(() => {
"use strict";
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const blueScoreEl = document.getElementById("blue-score");
const redScoreEl = document.getElementById("red-score");
const clockEl = document.getElementById("clock");

const state = {
  w: 960, h: 540, last: 0, elapsed: 0, remaining: 300,
  blue: 0, red: 0, running: true, joystick: {x:0,y:0,active:false},
  sprint: false, pass: false, shoot: false, message: "Coup d'envoi"
};
const field = {x:42,y:48,w:876,h:444};
const players = [];
const ball = {x:480,y:270,vx:0,vy:0,r:8,owner:0};
let playerId = 0;

function makePlayer(team,x,y,user=false){
  return {id:++playerId,team,x,y,vx:0,vy:0,r:13,speed:user?175:112,user,dirX:team===0?1:-1,dirY:0,stamina:100,cooldown:0};
}
players.push(makePlayer(0, field.x+field.w*.34, field.y+field.h*.5, true));
players.push(makePlayer(0, field.x+field.w*.22, field.y+field.h*.25));
players.push(makePlayer(0, field.x+field.w*.22, field.y+field.h*.75));
players.push(makePlayer(0, field.x+field.w*.12, field.y+field.h*.5));
players.push(makePlayer(0, field.x+field.w*.42, field.y+field.h*.18));
players.push(makePlayer(1, field.x+field.w*.66, field.y+field.h*.5));
players.push(makePlayer(1, field.x+field.w*.78, field.y+field.h*.25));
players.push(makePlayer(1, field.x+field.w*.78, field.y+field.h*.75));
players.push(makePlayer(1, field.x+field.w*.88, field.y+field.h*.5));
players.push(makePlayer(1, field.x+field.w*.58, field.y+field.h*.82));

const user = players[0];
function resize(){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.floor(canvas.clientWidth*dpr);
  canvas.height=Math.floor(canvas.clientHeight*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  state.w=canvas.clientWidth; state.h=canvas.clientHeight;
}
window.addEventListener("resize",resize); resize();

function toWorldX(x){return field.x+(x/state.w)*field.w}
function toWorldY(y){return field.y+(y/state.h)*field.h}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function norm(x,y){const l=Math.hypot(x,y)||1;return{x:x/l,y:y/l}}
function nearestPlayer(x,y,team=null){
  let best=null,dist=1e9;
  for(const p of players){if(team!==null&&p.team!==team)continue;const d=Math.hypot(p.x-x,p.y-y);if(d<dist){dist=d;best=p}}
  return best;
}
function resetAfterGoal(team){
  if(team===0){state.blue++;blueScoreEl.textContent=state.blue}else{state.red++;redScoreEl.textContent=state.red}
  ball.x=field.x+field.w/2;ball.y=field.y+field.h/2;ball.vx=ball.vy=0;ball.owner=0;
  players.forEach((p,i)=>{p.x=field.x+field.w*(p.team===0?(i%5===0?.34:.22):(i%5===0?.66:.78));p.y=field.y+field.h*(.2+(i%4)*.2);p.vx=p.vy=0});
  state.message="But !";
}
function kick(p,power,accuracy=0.9){
  const d=norm(p.dirX,p.dirY);
  ball.owner=0;ball.x=p.x+d.x*20;ball.y=p.y+d.y*20;
  ball.vx=d.x*power+(Math.random()-.5)*accuracy*55;
  ball.vy=d.y*power+(Math.random()-.5)*accuracy*55;
  p.cooldown=.28;
}
function update(dt){
  if(!state.running)return;
  state.remaining=Math.max(0,state.remaining-dt);
  if(state.remaining===0){state.running=false;state.message="Fin du test";}
  const j=state.joystick;
  let dx=j.x,dy=j.y;
  if(Math.hypot(dx,dy)>.12){
    const d=norm(dx,dy);user.dirX=d.x;user.dirY=d.y;
  }
  const sprinting=state.sprint&&user.stamina>2&&Math.hypot(dx,dy)>.1;
  const targetSpeed=user.speed*(sprinting?1.42:1);
  if(sprinting)user.stamina=Math.max(0,user.stamina-24*dt);else user.stamina=Math.min(100,user.stamina+12*dt);
  user.vx+=(dx*targetSpeed-user.vx)*Math.min(1,dt*10);
  user.vy+=(dy*targetSpeed-user.vy)*Math.min(1,dt*10);
  user.x+=user.vx*dt;user.y+=user.vy*dt;
  user.x=clamp(user.x,field.x+12,field.x+field.w-12);user.y=clamp(user.y,field.y+12,field.y+field.h-12);
  user.cooldown=Math.max(0,user.cooldown-dt);

  // Simple positioning AI for the local training prototype.
  for(const p of players){
    if(p.user)continue;
    p.cooldown=Math.max(0,p.cooldown-dt);
    const hasBall=ball.owner===p.id;
    let tx=p.x,ty=p.y;
    if(p.team===1 && ball.owner===0){tx=ball.x;ty=ball.y}
    else if(p.team===0 && ball.owner===0){tx=ball.x+70;ty=ball.y+(p.y-field.y-field.h/2)*.25}
    else if(hasBall){tx+=p.team===0?120:-120}
    else {tx+=(p.team===0?25:-25)}
    const d=norm(tx-p.x,ty-p.y);
    p.vx+=(d.x*p.speed-p.vx)*Math.min(1,dt*3);
    p.vy+=(d.y*p.speed-p.vy)*Math.min(1,dt*3);
    p.x=clamp(p.x+p.vx*dt,field.x+12,field.x+field.w-12);
    p.y=clamp(p.y+p.vy*dt,field.y+12,field.y+field.h-12);
    p.dirX=d.x;p.dirY=d.y;
    if(hasBall && p.cooldown<=0 && Math.random()<dt*.35)kick(p,245,.45);
  }

  if(ball.owner){
    const owner=players.find(p=>p.id===ball.owner);
    if(owner){
      const d=norm(owner.dirX,owner.dirY);
      ball.x=owner.x+d.x*19;ball.y=owner.y+d.y*19;
      ball.vx=owner.vx*.75;ball.vy=owner.vy*.75;
    }else ball.owner=0;
  }else{
    ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
    const friction=Math.pow(.985,dt*60);ball.vx*=friction;ball.vy*=friction;
    if(Math.hypot(ball.vx,ball.vy)<7)ball.vx=ball.vy=0;
    if(ball.y<field.y+ball.r||ball.y>field.y+field.h-ball.r){ball.vy*=-.78;ball.y=clamp(ball.y,field.y+ball.r,field.y+field.h-ball.r)}
    const goalTop=field.y+field.h*.36,goalBottom=field.y+field.h*.64;
    if(ball.x<field.x+ball.r){
      if(ball.y>goalTop&&ball.y<goalBottom){resetAfterGoal(1);return}
      ball.vx=Math.abs(ball.vx)*.78;ball.x=field.x+ball.r;
    }
    if(ball.x>field.x+field.w-ball.r){
      if(ball.y>goalTop&&ball.y<goalBottom){resetAfterGoal(0);return}
      ball.vx=-Math.abs(ball.vx)*.78;ball.x=field.x+field.w-ball.r;
    }
    const near=nearestPlayer(ball.x,ball.y);
    if(near&&Math.hypot(near.x-ball.x,near.y-ball.y)<near.r+ball.r+3&&Math.hypot(ball.vx,ball.vy)<160){
      ball.owner=near.id;state.message=near.user?"Tu as le ballon":"";
    }
  }
  if(state.pass){state.pass=false;const teammate=players.filter(p=>p.team===0&&p.id!==user.id).sort((a,b)=>Math.hypot(a.x-user.x,a.y-user.y)-Math.hypot(b.x-user.x,b.y-user.y))[0];if(ball.owner===user.id){const d=norm(teammate.x-user.x,teammate.y-user.y);user.dirX=d.x;user.dirY=d.y;kick(user,300,.08)}else if(Math.hypot(ball.x-user.x,ball.y-user.y)<38){ball.owner=user.id;kick(user,300,.08)}}
  if(state.shoot&&ball.owner===user.id){state.shoot=false;kick(user,440,.03)}
  else if(state.shoot){state.shoot=false;if(Math.hypot(ball.x-user.x,ball.y-user.y)<40){ball.owner=user.id;kick(user,440,.03)}}
}

function draw(){
  const sx=state.w/field.w, sy=state.h/field.h;
  ctx.clearRect(0,0,state.w,state.h);
  ctx.save();ctx.scale(sx,sy);ctx.translate(-field.x,-field.y);
  ctx.fillStyle="#17613d";ctx.fillRect(field.x,field.y,field.w,field.h);
  for(let i=0;i<10;i++){ctx.fillStyle=i%2?"#1a6842":"#1c7046";ctx.fillRect(field.x+i*field.w/10,field.y,field.w/10,field.h)}
  ctx.strokeStyle="#e9f7ed";ctx.lineWidth=2;ctx.strokeRect(field.x,field.y,field.w,field.h);
  ctx.beginPath();ctx.moveTo(field.x+field.w/2,field.y);ctx.lineTo(field.x+field.w/2,field.y+field.h);ctx.stroke();
  ctx.beginPath();ctx.arc(field.x+field.w/2,field.y+field.h/2,62,0,Math.PI*2);ctx.stroke();
  ctx.strokeRect(field.x,field.y+field.h*.29,105,field.h*.42);ctx.strokeRect(field.x+field.w-105,field.y+field.h*.29,105,field.h*.42);
  ctx.strokeRect(field.x,field.y+field.h*.36,14,field.h*.28);ctx.strokeRect(field.x+field.w-14,field.y+field.h*.36,14,field.h*.28);
  // Goals
  ctx.fillStyle="#dbe9e2";ctx.fillRect(field.x-9,field.y+field.h*.36,9,field.h*.28);ctx.fillRect(field.x+field.w,field.y+field.h*.36,9,field.h*.28);
  for(const p of players){
    ctx.beginPath();ctx.fillStyle="#0005";ctx.ellipse(p.x+2,p.y+8,p.r+2,7,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.fillStyle=p.team===0?"#247de0":"#e34b43";ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
    ctx.lineWidth=p.user?3:1.5;ctx.strokeStyle=p.user?"#fff2a8":"#ffffffcc";ctx.stroke();
    ctx.fillStyle="#fff";ctx.font="bold 10px Arial";ctx.textAlign="center";ctx.fillText(p.user?"1":String((p.id-1)%5+1),p.x,p.y+3.5);
    if(p.user){ctx.strokeStyle="#fff2a8";ctx.beginPath();ctx.arc(p.x,p.y,p.r+6,0,Math.PI*2);ctx.stroke()}
  }
  ctx.beginPath();ctx.fillStyle="#f7f7f2";ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#17231d";ctx.lineWidth=1.5;ctx.stroke();
  ctx.restore();
  const mins=Math.floor(state.remaining/60),secs=Math.floor(state.remaining%60);clockEl.textContent=String(mins).padStart(2,"0")+":"+String(secs).padStart(2,"0");
}
function frame(t){const dt=Math.min(.033,(t-state.last)/1000||0);state.last=t;update(dt);draw();requestAnimationFrame(frame)}
requestAnimationFrame(frame);

// Touch joystick
const zone=document.getElementById("stick-zone"), base=document.getElementById("stick-base"), knob=document.getElementById("stick-knob");
let stickPointer=null;
function setStick(e){
 const r=base.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
 let dx=(e.clientX-cx)/(r.width*.34),dy=(e.clientY-cy)/(r.height*.34);
 const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l}
 state.joystick.x=dx;state.joystick.y=dy;
 knob.style.transform=`translate(${dx*r.width*.28}px,${dy*r.height*.28}px)`;
}
zone.addEventListener("pointerdown",e=>{stickPointer=e.pointerId;zone.setPointerCapture(stickPointer);setStick(e)});
zone.addEventListener("pointermove",e=>{if(e.pointerId===stickPointer)setStick(e)});
function releaseStick(){stickPointer=null;state.joystick.x=state.joystick.y=0;knob.style.transform="translate(0,0)"}
zone.addEventListener("pointerup",releaseStick);zone.addEventListener("pointercancel",releaseStick);
function holdButton(id,down,up){const el=document.getElementById(id);el.addEventListener("pointerdown",e=>{e.preventDefault();el.classList.add("active");down()});["pointerup","pointercancel","pointerleave"].forEach(ev=>el.addEventListener(ev,()=>{el.classList.remove("active");if(up)up()}))}
holdButton("sprint",()=>state.sprint=true,()=>state.sprint=false);
holdButton("pass",()=>state.pass=true);
holdButton("shoot",()=>state.shoot=true);
window.addEventListener("keydown",e=>{if(e.key==="ArrowUp"||e.key==="w")state.joystick.y=-1;if(e.key==="ArrowDown"||e.key==="s")state.joystick.y=1;if(e.key==="ArrowLeft"||e.key==="a")state.joystick.x=-1;if(e.key==="ArrowRight"||e.key==="d")state.joystick.x=1;if(e.key==="Shift")state.sprint=true;if(e.key===" ")state.shoot=true;if(e.key==="e")state.pass=true});
window.addEventListener("keyup",e=>{if(["ArrowUp","ArrowDown","w","s"].includes(e.key))state.joystick.y=0;if(["ArrowLeft","ArrowRight","a","d"].includes(e.key))state.joystick.x=0;if(e.key==="Shift")state.sprint=false});
})();