(() => {
"use strict";
const canvas=document.getElementById("game"),ctx=canvas.getContext("2d");
const blueScoreEl=document.getElementById("blue-score"),redScoreEl=document.getElementById("red-score");
const clockEl=document.getElementById("clock"),periodEl=document.getElementById("period");
const statusEl=document.getElementById("status"),staminaFill=document.getElementById("stamina-fill");
const overlay=document.getElementById("overlay"),overlayTitle=document.getElementById("overlay-title"),overlayText=document.getElementById("overlay-text");
const state={w:960,h:540,last:0,remaining:300,blue:0,red:0,joystick:{x:0,y:0},sprint:false,pass:false,shoot:false,defend:false,phase:"play",phaseTimer:0,period:1,message:"Coup d'envoi",messageTimer:2};
const field={x:42,y:48,w:876,h:444},players=[];
const ball={x:480,y:270,vx:0,vy:0,r:8,owner:0,lastTouch:0};
let nextId=0;
const formations=[
 [0.13,0.50,"GK"],[0.29,0.28,"DEF"],[0.29,0.72,"DEF"],[0.43,0.38,"MID"],[0.43,0.62,"ATT"],
 [0.87,0.50,"GK"],[0.71,0.28,"DEF"],[0.71,0.72,"DEF"],[0.57,0.38,"MID"],[0.57,0.62,"ATT"]
];
function makePlayer(team,x,y,user=false,role="MID"){
 return {id:++nextId,team,x,y,vx:0,vy:0,r:role==="GK"?15:13,speed:user?185:(role==="GK"?92:125),user,role,dirX:team===0?1:-1,dirY:0,stamina:100,cooldown:0,tackleCooldown:0,think:0};
}
formations.forEach((f,i)=>players.push(makePlayer(i<5?0:1,field.x+field.w*f[0],field.y+field.h*f[1],i===3,f[2])));
const user=players.find(p=>p.user);
function resize(){const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.floor(canvas.clientWidth*dpr);canvas.height=Math.floor(canvas.clientHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);state.w=canvas.clientWidth;state.h=canvas.clientHeight}
addEventListener("resize",resize);resize();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const norm=(x,y)=>{const l=Math.hypot(x,y)||1;return{x:x/l,y:y/l}};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function say(msg,t=1.4){state.message=msg;state.messageTimer=t;statusEl.textContent=msg}
function nearest(x,y,team=null,exclude=null){let best=null,dmin=1e9;for(const p of players){if((team!==null&&p.team!==team)||p===exclude)continue;const d=Math.hypot(p.x-x,p.y-y);if(d<dmin){dmin=d;best=p}}return best}
function resetPositions(){
 formations.forEach((f,i)=>{const p=players[i];p.x=field.x+field.w*f[0];p.y=field.y+field.h*f[1];p.vx=p.vy=0;p.stamina=Math.min(100,p.stamina+12)});
 ball.x=field.x+field.w/2;ball.y=field.y+field.h/2;ball.vx=ball.vy=0;ball.owner=0;
}
function resetAfterGoal(team){
 if(team===0){state.blue++;blueScoreEl.textContent=state.blue}else{state.red++;redScoreEl.textContent=state.red}
 resetPositions();say(team===0?"BUT BLEU !":"BUT ROUGE !",2);
}
function kick(p,power,spread=0.08,target=null){
 let d=target?norm(target.x-p.x,target.y-p.y):norm(p.dirX,p.dirY);
 if(p.team===0&&p.user&&state.shoot){d=norm(field.x+field.w-p.x-p.x*0+0-p.x,field.y+field.h/2-p.y)}
 ball.owner=0;ball.lastTouch=p.team;ball.x=p.x+d.x*20;ball.y=p.y+d.y*20;
 ball.vx=d.x*power+(Math.random()-.5)*spread*power;ball.vy=d.y*power+(Math.random()-.5)*spread*power;p.cooldown=.35;
}
function attemptPass(p){
 const mate=players.filter(q=>q.team===p.team&&q!==p&&q.role!=="GK").sort((a,b)=>{
  const da=dist(a,p),db=dist(b,p);const forwardA=(a.x-p.x)*(p.team===0?1:-1),forwardB=(b.x-p.x)*(p.team===0?1:-1);
  return (db-da)*.35+(forwardB-forwardA)*.015;
 })[0];
 if(!mate)return;
 if(ball.owner!==p.id&&dist(ball,p)>42)return;
 ball.owner=p.id;p.dirX=norm(mate.x-p.x,mate.y-p.y).x;p.dirY=norm(mate.x-p.x,mate.y-p.y).y;
 kick(p,330,.025,mate);say("Passe !");
}
function attemptShot(p){
 if(ball.owner!==p.id&&dist(ball,p)>40)return;
 ball.owner=p.id;
 const goal={x:p.team===0?field.x+field.w:field.x,y:field.y+field.h/2};
 const d=norm(goal.x-p.x,goal.y-p.y);
 p.dirX=d.x;p.dirY=d.y;
 ball.owner=0;ball.lastTouch=p.team;ball.x=p.x+d.x*20;ball.y=p.y+d.y*20;
 ball.vx=d.x*485;ball.vy=d.y*485+(Math.random()-.5)*12;p.cooldown=.4;say("Frappe !");
}
function tackle(p){
 if(p.tackleCooldown>0)return;
 p.tackleCooldown=.75;
 const rival=nearest(p.x,p.y,1-p.team);
 if(rival&&dist(p,rival)<p.r+rival.r+23){
  if(ball.owner===rival.id){ball.owner=p.id;ball.x=p.x+p.dirX*18;ball.y=p.y+p.dirY*18;say(p.user?"Ballon récupéré !":"Récupération");}
  else if(!ball.owner&&dist(ball,p)<34){ball.owner=p.id;say("Interception !");}
  rival.vx+=p.dirX*80;rival.vy+=p.dirY*80;
 }else if(!ball.owner&&dist(ball,p)<35){ball.owner=p.id;say("Ballon récupéré !")}
}
function keeperAI(p,dt){
 const ownX=p.team===0?field.x+20:field.x+field.w-20;
 const targetY=clamp(ball.y,field.y+field.h*.39,field.y+field.h*.61);
 const tx=ownX,ty=targetY;
 const d=norm(tx-p.x,ty-p.y);
 p.vx+=(d.x*p.speed-p.vx)*Math.min(1,dt*5);p.vy+=(d.y*p.speed-p.vy)*Math.min(1,dt*5);
 p.x=clamp(p.x+p.vx*dt,field.x+12,field.x+field.w-12);p.y=clamp(p.y+p.vy*dt,field.y+12,field.y+field.h-12);
 if(!ball.owner&&dist(p,ball)<p.r+ball.r+9&&Math.hypot(ball.vx,ball.vy)>60){ball.vx*=-.55;ball.vy+=(Math.random()-.5)*55;ball.lastTouch=p.team;say("Arrêt du gardien !")}
 if(ball.owner===p.id&&p.cooldown<=0){const mate=nearest(p.team===0?field.x+field.w*.35:field.x+field.w*.65,field.y+field.h/2,p.team,p);if(mate)kick(p,270,.08,mate)}
}
function aiUpdate(p,dt){
 p.cooldown=Math.max(0,p.cooldown-dt);p.tackleCooldown=Math.max(0,p.tackleCooldown-dt);
 if(p.role==="GK"){keeperAI(p,dt);return}
 const ownDir=p.team===0?1:-1,ownMid=field.y+field.h/2;
 let tx=p.x,ty=p.y;
 const rivalOwner=ball.owner?players.find(q=>q.id===ball.owner):null;
 if(ball.owner===p.id){tx+=ownDir*145;ty=clamp(p.y+(ownMid-p.y)*.25,field.y+45,field.y+field.h-45);if(p.cooldown<=0&&Math.random()<dt*.22){const goalX=p.team===0?field.x+field.w:field.x;const distance=Math.abs(goalX-p.x);if(distance<260)kick(p,410,.08);else attemptPass(p)}}
 else if(rivalOwner&&rivalOwner.team!==p.team){const chaser=nearest(ball.x,ball.y,p.team);if(chaser===p){tx=ball.x;ty=ball.y}else{tx=p.x+ownDir*-25;ty=clamp(p.y+(ball.y-p.y)*.15,field.y+35,field.y+field.h-35)}}
 else if(!ball.owner){const chaser=nearest(ball.x,ball.y,p.team);if(chaser===p){tx=ball.x;ty=ball.y}else{tx=field.x+field.w*(p.team===0?.34:.66);ty=clamp(p.y+(ball.y-p.y)*.12,field.y+35,field.y+field.h-35)}}
 else if(rivalOwner&&rivalOwner.team===p.team){tx=p.x+ownDir*35;ty=clamp(p.y+(ownMid-p.y)*.12,field.y+35,field.y+field.h-35)}
 const d=norm(tx-p.x,ty-p.y);p.dirX=d.x;p.dirY=d.y;
 const speed=p.speed*(p.stamina<20?.78:1);
 p.vx+=(d.x*speed-p.vx)*Math.min(1,dt*3.8);p.vy+=(d.y*speed-p.vy)*Math.min(1,dt*3.8);
 p.x=clamp(p.x+p.vx*dt,field.x+12,field.x+field.w-12);p.y=clamp(p.y+p.vy*dt,field.y+12,field.y+field.h-12);
 p.stamina=Math.min(100,p.stamina+5*dt);
 if(!ball.owner&&dist(p,ball)<p.r+ball.r+5&&Math.hypot(ball.vx,ball.vy)<250){ball.owner=p.id;say(p.team===0?"Bleu récupère":"Rouge récupère",.7)}
 if(rivalOwner&&rivalOwner.team!==p.team&&dist(p,rivalOwner)<p.r+rivalOwner.r+8&&p.tackleCooldown<=0&&Math.random()<dt*.9)tackle(p);
}
function updateBall(dt){
 if(ball.owner){const p=players.find(q=>q.id===ball.owner);if(!p){ball.owner=0;return}
  const d=norm(p.dirX,p.dirY);ball.x=p.x+d.x*19;ball.y=p.y+d.y*19;ball.vx=p.vx*.7;ball.vy=p.vy*.7;return}
 ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;const friction=Math.pow(.986,dt*60);ball.vx*=friction;ball.vy*=friction;
 if(Math.hypot(ball.vx,ball.vy)<8)ball.vx=ball.vy=0;
 if(ball.y<field.y+ball.r||ball.y>field.y+field.h-ball.r){ball.vy*=-.76;ball.y=clamp(ball.y,field.y+ball.r,field.y+field.h-ball.r)}
 const gt=field.y+field.h*.36,gb=field.y+field.h*.64;
 if(ball.x<field.x+ball.r){if(ball.y>gt&&ball.y<gb){resetAfterGoal(1);return}ball.vx=Math.abs(ball.vx)*.78;ball.x=field.x+ball.r}
 if(ball.x>field.x+field.w-ball.r){if(ball.y>gt&&ball.y<gb){resetAfterGoal(0);return}ball.vx=-Math.abs(ball.vx)*.78;ball.x=field.x+field.w-ball.r}
 if(!ball.owner){const near=nearest(ball.x,ball.y);if(near&&dist(near,ball)<near.r+ball.r+3&&Math.hypot(ball.vx,ball.vy)<290){ball.owner=near.id;say(near.team===0?"Ballon bleu":"Ballon rouge",.6)}}
}
function startSecondHalf(){
 state.period=2;state.phase="play";state.phaseTimer=0;state.remaining=150;overlay.classList.add("hidden");periodEl.textContent="2E PÉRIODE";resetPositions();say("Deuxième période",2);
}
function update(dt){
 if(state.phase!=="play"){state.phaseTimer-=dt;if(state.phaseTimer<=0){if(state.phase==="halftime")startSecondHalf();else{state.phase="finished";overlayTitle.textContent="Fin du match";overlayText.textContent=`Score final : ${state.blue} — ${state.red}`;overlay.classList.remove("hidden")}}return}
 state.remaining=Math.max(0,state.remaining-dt);
 if(state.remaining===0&&state.period===1){state.phase="halftime";state.phaseTimer=3;overlayTitle.textContent="Mi-temps";overlayText.textContent=`${state.blue} — ${state.red} · Reprise dans 3 secondes`;overlay.classList.remove("hidden");return}
 if(state.remaining===0&&state.period===2){state.phase="finished";overlayTitle.textContent="Fin du match";overlayText.textContent=`Score final : ${state.blue} — ${state.red}`;overlay.classList.remove("hidden");return}
 const j=state.joystick,mag=Math.hypot(j.x,j.y),moving=mag>.1,d=moving?norm(j.x,j.y):{x:0,y:0};
 if(moving){user.dirX=d.x;user.dirY=d.y}
 const sprinting=state.sprint&&moving&&user.stamina>1;
 const speed=user.speed*(sprinting?1.42:1);
 user.stamina=clamp(user.stamina+(sprinting?-27:11)*dt,0,100);
 user.vx+=(d.x*speed-user.vx)*Math.min(1,dt*11);user.vy+=(d.y*speed-user.vy)*Math.min(1,dt*11);
 user.x=clamp(user.x+user.vx*dt,field.x+12,field.x+field.w-12);user.y=clamp(user.y+user.vy*dt,field.y+12,field.y+field.h-12);
 user.cooldown=Math.max(0,user.cooldown-dt);user.tackleCooldown=Math.max(0,user.tackleCooldown-dt);
 for(const p of players)if(!p.user)aiUpdate(p,dt);
 updateBall(dt);
 if(state.pass){state.pass=false;attemptPass(user)}
 if(state.shoot){state.shoot=false;attemptShot(user)}
 if(state.defend){state.defend=false;tackle(user)}
 staminaFill.style.width=user.stamina+"%";
 if(state.messageTimer>0){state.messageTimer-=dt;statusEl.textContent=state.message}else statusEl.textContent=ball.owner===user.id?"TU AS LE BALLON":"";
 const mins=Math.floor(state.remaining/60),secs=Math.floor(state.remaining%60);clockEl.textContent=String(mins).padStart(2,"0")+":"+String(secs).padStart(2,"0");
}
function draw(){
 const sx=state.w/field.w,sy=state.h/field.h;ctx.clearRect(0,0,state.w,state.h);ctx.save();ctx.scale(sx,sy);ctx.translate(-field.x,-field.y);
 ctx.fillStyle="#17613d";ctx.fillRect(field.x,field.y,field.w,field.h);
 for(let i=0;i<10;i++){ctx.fillStyle=i%2?"#1a6842":"#1c7046";ctx.fillRect(field.x+i*field.w/10,field.y,field.w/10,field.h)}
 ctx.strokeStyle="#e9f7ed";ctx.lineWidth=2;ctx.strokeRect(field.x,field.y,field.w,field.h);
 ctx.beginPath();ctx.moveTo(field.x+field.w/2,field.y);ctx.lineTo(field.x+field.w/2,field.y+field.h);ctx.stroke();
 ctx.beginPath();ctx.arc(field.x+field.w/2,field.y+field.h/2,62,0,Math.PI*2);ctx.stroke();
 ctx.strokeRect(field.x,field.y+field.h*.29,105,field.h*.42);ctx.strokeRect(field.x+field.w-105,field.y+field.h*.29,105,field.h*.42);
 ctx.fillStyle="#dbe9e2";ctx.fillRect(field.x-9,field.y+field.h*.36,9,field.h*.28);ctx.fillRect(field.x+field.w,field.y+field.h*.36,9,field.h*.28);
 for(const p of players){
  ctx.beginPath();ctx.fillStyle="#0005";ctx.ellipse(p.x+2,p.y+8,p.r+2,7,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.fillStyle=p.team===0?"#247de0":"#e34b43";ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
  ctx.lineWidth=p.user?3:1.5;ctx.strokeStyle=p.user?"#fff2a8":p.role==="GK"?"#ffe27a":"#ffffffcc";ctx.stroke();
  ctx.fillStyle="#fff";ctx.font="bold 10px Arial";ctx.textAlign="center";ctx.fillText(p.user?"1":String((p.id-1)%5+1),p.x,p.y+3.5);
  if(p.user){ctx.strokeStyle="#fff2a8";ctx.beginPath();ctx.arc(p.x,p.y,p.r+6,0,Math.PI*2);ctx.stroke()}
 }
 ctx.beginPath();ctx.fillStyle="#f7f7f2";ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#17231d";ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
}
function frame(t){const dt=Math.min(.033,(t-state.last)/1000||0);state.last=t;update(dt);draw();requestAnimationFrame(frame)}
requestAnimationFrame(frame);
const zone=document.getElementById("stick-zone"),base=document.getElementById("stick-base"),knob=document.getElementById("stick-knob");let stickPointer=null;
function setStick(e){const r=base.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=(e.clientX-cx)/(r.width*.34),dy=(e.clientY-cy)/(r.height*.34);const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l}state.joystick.x=dx;state.joystick.y=dy;knob.style.transform=`translate(${dx*r.width*.28}px,${dy*r.height*.28}px)`}
zone.addEventListener("pointerdown",e=>{stickPointer=e.pointerId;zone.setPointerCapture(stickPointer);setStick(e)});
zone.addEventListener("pointermove",e=>{if(e.pointerId===stickPointer)setStick(e)});
function releaseStick(){stickPointer=null;state.joystick.x=state.joystick.y=0;knob.style.transform="translate(0,0)"}
zone.addEventListener("pointerup",releaseStick);zone.addEventListener("pointercancel",releaseStick);
function bindButton(id,down,up){const el=document.getElementById(id);el.addEventListener("pointerdown",e=>{e.preventDefault();el.classList.add("active");down()});["pointerup","pointercancel","pointerleave"].forEach(ev=>el.addEventListener(ev,()=>{el.classList.remove("active");if(up)up()}))}
bindButton("sprint",()=>state.sprint=true,()=>state.sprint=false);
bindButton("pass",()=>state.pass=true);bindButton("shoot",()=>state.shoot=true);bindButton("defend",()=>state.defend=true);
addEventListener("keydown",e=>{if(e.key==="ArrowUp"||e.key==="w")state.joystick.y=-1;if(e.key==="ArrowDown"||e.key==="s")state.joystick.y=1;if(e.key==="ArrowLeft"||e.key==="a")state.joystick.x=-1;if(e.key==="ArrowRight"||e.key==="d")state.joystick.x=1;if(e.key==="Shift")state.sprint=true;if(e.key===" ")state.shoot=true;if(e.key==="e")state.pass=true;if(e.key==="q")state.defend=true});
addEventListener("keyup",e=>{if(["ArrowUp","ArrowDown","w","s"].includes(e.key))state.joystick.y=0;if(["ArrowLeft","ArrowRight","a","d"].includes(e.key))state.joystick.x=0;if(e.key==="Shift")state.sprint=false});
})();