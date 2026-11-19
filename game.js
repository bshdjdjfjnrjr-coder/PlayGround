import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, .1, 240);
camera.position.set(0, 5.2, -10);
const clock = new THREE.Clock();
const hemi = new THREE.HemisphereLight(0xbde7db, 0x18251d, 1.35); scene.add(hemi);
const moon = new THREE.DirectionalLight(0xc9f0e2, 2.4); moon.position.set(-5, 12, 4); moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024); moon.shadow.camera.left = -15; moon.shadow.camera.right = 15; moon.shadow.camera.top = 18; moon.shadow.camera.bottom = -18; scene.add(moon);
const fill = new THREE.PointLight(0x89ffe6, 32, 24); scene.add(fill);
const world = new THREE.Group(); scene.add(world);
const COLORS = [
  { name:'THE FORGOTTEN GROVE', subtitle:'WHERE THE VEIL FIRST THINNED', sky:0x102522, fog:0x102522, ground:0x172b22, path:0x273b2e, accent:0xc9f36d, tree:0x1d4837, rock:0x283c35, biome:'GROVE' },
  { name:'THE SUNKEN CITADEL', subtitle:'A CITY BURIED BENEATH THE TIDE', sky:0x14252e, fog:0x14252e, ground:0x192a32, path:0x293d43, accent:0x72e7dd, tree:0x23505a, rock:0x263e49, biome:'CITADEL' },
  { name:'THE ASHEN CROWN', subtitle:'THE WARDEN WAITS BEYOND THE VEIL', sky:0x291d2c, fog:0x291d2c, ground:0x30222b, path:0x48303b, accent:0xffae85, tree:0x58333b, rock:0x513640, biome:'ASHEN' }
];
let chapter = 0, state = 'menu', running = true, soundEnabled = true, shakeEnabled = true;
let player, playerParts = {}, enemies = [], shards = [], obstacles = [], particles = [], scenery = [], boss = null, gate = null;
let distance = 0, score = 0, shardCount = 0, health = 100, maxShards = 0, gameTime = 0;
let jumpVelocity = 0, jumps = 0, attackTimer = 0, dashTimer = 0, shieldTimer = 0, lightningTimer = 0, invulnTimer = 0, hurtTimer = 0, slideTimer = 0;
let cooldowns = { dash:0, shield:0, lightning:0 }, keys = {}, touchMove = 0, toastTimer = 0, shake = 0, lastAttack = 0, soundCtx = null;
const stageLength = 100;

function mat(color, roughness=.8, metalness=0, extra={}) { return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }); }
function addMesh(parent, geometry, material, x=0,y=0,z=0, cast=true) { const m = new THREE.Mesh(geometry,material); m.position.set(x,y,z); if(cast)m.castShadow=true; m.receiveShadow=true; parent.add(m); return m; }
function makeBox(parent, color, size, pos, roughness=.8) { return addMesh(parent,new THREE.BoxGeometry(...size),mat(color,roughness),...pos); }
function playTone(freq=280,duration=.08,type='sine',volume=.035){ if(!soundEnabled)return; try { soundCtx ||= new (window.AudioContext||window.webkitAudioContext)(); const o=soundCtx.createOscillator(),g=soundCtx.createGain(); o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,soundCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,soundCtx.currentTime+duration);o.connect(g);g.connect(soundCtx.destination);o.start();o.stop(soundCtx.currentTime+duration); }catch{} }
function toast(text){ const el=$('toast');el.textContent=text;el.classList.add('show');toastTimer=2.2; }
function setScreen(id){ document.querySelectorAll('.screen').forEach(e=>e.classList.remove('visible')); if(id)$(`${id}`).classList.add('visible'); }
function showMenu(){ state='menu';$('hud').classList.add('hidden');$('boss-bar').classList.add('hidden');setScreen('main-menu'); }
function showSettings(){setScreen('settings-screen');}
function showLevels(){buildLevelCards();setScreen('level-screen');}
function buildLevelCards(){ const box=$('level-cards');box.innerHTML='';COLORS.forEach((c,i)=>{const unlocked=i===0||i<=Number(localStorage.getItem('shadow-unlocked')||0);const b=document.createElement('button');b.className='level-card'+(unlocked?'':' locked');b.style.setProperty('--card-color','#'+c.accent.toString(16).padStart(6,'0'));b.innerHTML=`<span>0${i+1} / 03 ${unlocked?'':' · LOCKED'}</span><b>${c.name}</b><small>${c.subtitle}</small>`;b.onclick=()=>{if(unlocked)startChapter(i)};box.append(b);}); }

const groundMat=mat(0x172b22), pathMat=mat(0x273b2e), glowMat=mat(0xc9f36d,.3,.2,{emissive:0x445c1b,emissiveIntensity:1}), darkMat=mat(0x10201b), barkMat=mat(0x493a2b), leafMat=mat(0x1d4837), shardMat=mat(0xd6fb7a,.18,.35,{emissive:0x779c31,emissiveIntensity:1.6});
function makePlayer(){const root=new THREE.Group();scene.add(root);const cloth=mat(0x202c2e,.56,.05), cloak=mat(0x111b20,.84), skin=mat(0xc99575,.8), silver=mat(0xd6e0ce,.35,.55), dark=mat(0x111719,.42,.3), glow=mat(0xb6f878,.25,.2,{emissive:0x548423,emissiveIntensity:1.2});
 const torso=addMesh(root,new THREE.CapsuleGeometry(.34,.55,5,9),cloth,0,1.05,0); torso.scale.set(1,.95,.8);
 const mantle=addMesh(root,new THREE.ConeGeometry(.48,.97,5),cloak,0,.68,-.24);mantle.rotation.x=-Math.PI*.08;mantle.rotation.z=Math.PI;
 const head=addMesh(root,new THREE.SphereGeometry(.24,12,10),skin,0,1.78,.04);head.scale.set(.86,1.08,.85);
 const hood=addMesh(root,new THREE.SphereGeometry(.3,10,8,0,Math.PI*2,0,Math.PI*.6),cloak,0,1.88,-.02);hood.scale.set(1.05,1,.95);
 const face=addMesh(root,new THREE.BoxGeometry(.2,.07,.07),glow,0,1.77,.246,false);
 const armGeo=new THREE.CapsuleGeometry(.105,.4,4,7), legGeo=new THREE.CapsuleGeometry(.13,.43,4,7);
 const leftArm=new THREE.Group();leftArm.position.set(-.39,1.25,0);root.add(leftArm);addMesh(leftArm,armGeo,cloth,0,-.2,0);addMesh(leftArm,new THREE.BoxGeometry(.14,.16,.18),silver,0,-.44,.02);
 const rightArm=new THREE.Group();rightArm.position.set(.39,1.25,0);root.add(rightArm);addMesh(rightArm,armGeo,cloth,0,-.2,0);addMesh(rightArm,new THREE.BoxGeometry(.14,.16,.18),silver,0,-.44,.02);
 const leftLeg=new THREE.Group();leftLeg.position.set(-.17,.65,0);root.add(leftLeg);addMesh(leftLeg,legGeo,dark,0,-.23,0);
 const rightLeg=new THREE.Group();rightLeg.position.set(.17,.65,0);root.add(rightLeg);addMesh(rightLeg,legGeo,dark,0,-.23,0);
 const sword=addMesh(rightArm,new THREE.CylinderGeometry(.025,.055,.78,6),silver,.04,-.48,.06);sword.rotation.z=-.23;
 const hilt=addMesh(rightArm,new THREE.CylinderGeometry(.04,.04,.18,6),glow,.04,-.18,.06);hilt.rotation.z=-.23;
 const ring=addMesh(root,new THREE.TorusGeometry(.53,.018,5,24),glowMat,0,.05,0,false);ring.rotation.x=Math.PI/2;ring.visible=false;
 playerParts={torso,leftArm,rightArm,leftLeg,rightLeg,hood,ring,face,cloak:mantle};root.position.set(0,0,0);return root;}
player=makePlayer();

function clearWorld(){while(world.children.length){const o=world.children.pop();if(o.geometry)o.geometry.dispose();}enemies=[];shards=[];obstacles=[];particles=[];scenery=[];boss=null;gate=null;}
function buildWorld(index){clearWorld();const c=COLORS[index];scene.background=new THREE.Color(c.sky);scene.fog=new THREE.Fog(c.fog,22,92);groundMat.color.setHex(c.ground);pathMat.color.setHex(c.path);glowMat.color.setHex(c.accent);glowMat.emissive.setHex(c.accent);leafMat.color.setHex(c.tree);shardMat.color.setHex(c.accent);shardMat.emissive.setHex(c.accent);moon.color.setHex(index===2?0xffc7ac:0xc9f0e2);fill.color.setHex(c.accent);
 // Long broken road, earth shelves and luminous route markings.
 const ground=addMesh(world,new THREE.PlaneGeometry(42,stageLength+75),mat(c.ground),0,-.26,stageLength/2-12,false);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;
 const road=addMesh(world,new THREE.PlaneGeometry(9,stageLength+30),mat(c.path),0,-.20,stageLength/2-5,false);road.rotation.x=-Math.PI/2;road.receiveShadow=true;
 for(let side of [-1,1]){const edge=addMesh(world,new THREE.BoxGeometry(.09,.04,stageLength+24),new THREE.MeshBasicMaterial({color:c.accent,transparent:true,opacity:.46}),side*4.48,-.12,stageLength/2-5,false);edge.userData.noDispose=false;}
 // Atmospheric floating dust.
 const dustGeo=new THREE.BufferGeometry(), dustCount=500, dustPos=new Float32Array(dustCount*3);for(let i=0;i<dustCount;i++){dustPos[i*3]=(Math.random()-.5)*35;dustPos[i*3+1]=Math.random()*12;dustPos[i*3+2]=Math.random()*(stageLength+30)-12;}dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPos,3));const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:c.accent,size:.055,transparent:true,opacity:.52,depthWrite:false}));world.add(dust);scenery.push({dust:true,obj:dust});
 // Environment silhouettes and close detail around the traversal corridor.
 for(let z=-9;z<stageLength+27;z+=5+Math.random()*5){for(let side of [-1,1]){const x=side*(6+Math.random()*6);if(index===1)makeCitadel(x,z,c);else if(index===2)makeAshRock(x,z,c);else makeTree(x,z,c);}}
 for(let z=8;z<stageLength-8;z+=12){for(let side of [-1,1]){const pillar=addMesh(world,new THREE.CylinderGeometry(.07,.12,2.1,6),mat(c.rock),side*4.1,.85,z+Math.random()*3);const orb=addMesh(world,new THREE.OctahedronGeometry(.18,0),glowMat,side*4.1,2.0,pillar.position.z,false);orb.userData.float=true;scenery.push({obj:orb,phase:Math.random()*6});}}
 // Placed shards, sentinels, and leap-over root-spires.
 maxShards=0;for(let i=0;i<18;i++){const z=7+i*4.7+Math.random()*2, x=(Math.random()-.5)*5.5;const group=new THREE.Group();group.position.set(x,1.1,z);world.add(group);const gem=addMesh(group,new THREE.OctahedronGeometry(.32,0),shardMat,0,0,0,false);gem.rotation.z=.35;const aura=addMesh(group,new THREE.TorusGeometry(.44,.012,4,20),glowMat,0,0,0,false);aura.rotation.x=Math.PI/2;shards.push({obj:group,baseY:1.1,phase:Math.random()*6});maxShards++;}
 for(let i=0;i<10;i++){const z=13+i*8.6+Math.random()*2,x=(Math.random()>.5?1:-1)*(1.2+Math.random()*2.2);spawnEnemy(x,z,false);}
 for(let i=0;i<7;i++){const z=17+i*11+Math.random()*2,x=(Math.random()-.5)*4.7;makeObstacle(x,z,c);}
 if(index===2){boss=spawnEnemy(0,71,true);boss.health=12;boss.maxHealth=12;$('boss-bar').classList.remove('hidden');}else $('boss-bar').classList.add('hidden');
 makeGate(0,stageLength-3,c);}
function makeTree(x,z,c){const g=new THREE.Group();g.position.set(x,0,z);world.add(g);const scale=.75+Math.random()*1.5;g.scale.setScalar(scale);const trunk=addMesh(g,new THREE.CylinderGeometry(.13,.26,2.2,6),barkMat,0,1.1,0);const leaves=addMesh(g,new THREE.ConeGeometry(1.2,3.8,7),leafMat,0,3.2,0);leaves.rotation.y=Math.random()*2;const top=addMesh(g,new THREE.ConeGeometry(.78,2.8,7),leafMat,0,4.7,.05);top.rotation.y=.4;scenery.push({obj:g,sway:Math.random()*5});}
function makeCitadel(x,z,c){const w=1.5+Math.random()*2,h=3+Math.random()*8;const block=addMesh(world,new THREE.BoxGeometry(w,h,1.4+Math.random()*2),mat(c.rock),x,h/2-.2,z);block.rotation.y=(Math.random()-.5)*.24;const win=addMesh(world,new THREE.BoxGeometry(.14,.5,.05),new THREE.MeshBasicMaterial({color:c.accent}),x,Math.min(h-.8,1.7),z+.75,false);win.material.transparent=true;win.material.opacity=.6;scenery.push({obj:block});}
function makeAshRock(x,z,c){const rock=addMesh(world,new THREE.DodecahedronGeometry(1.6+Math.random()*2,0),mat(c.rock),x,1.3+Math.random()*2,z);rock.scale.set(.8+Math.random(),1.1+Math.random(),.8+Math.random());rock.rotation.set(Math.random(),Math.random(),Math.random());const shard=addMesh(world,new THREE.ConeGeometry(.22,2.4,5),glowMat,x,3.1,z,false);shard.rotation.z=(Math.random()-.5)*.6;scenery.push({obj:rock});}
function makeObstacle(x,z,c){const g=new THREE.Group();g.position.set(x,0,z);world.add(g);const root=addMesh(g,new THREE.DodecahedronGeometry(.7,0),mat(c.rock),0,.45,0);root.scale.set(1.8,.7,1);const glow=addMesh(g,new THREE.TorusGeometry(.55,.045,5,14),glowMat,0,.25,0,false);glow.rotation.x=Math.PI/2;obstacles.push({obj:g,x,z,r:1.15});}
function spawnEnemy(x,z,isBoss){const group=new THREE.Group();group.position.set(x,0,z);world.add(group);const size=isBoss?1.7:1;const skin=mat(isBoss?0x301b28:0x20272a,.55,.18),red=mat(isBoss?0xff6e79:0xff9770,.25,.2,{emissive:isBoss?0xc2254d:0x7d3525,emissiveIntensity:1.5}),armor=mat(0x101518,.32,.6);addMesh(group,new THREE.CapsuleGeometry(.38*size,.8*size,5,8),skin,0,.9*size,0);const head=addMesh(group,new THREE.SphereGeometry(.3*size,9,8),armor,0,1.65*size,.02);head.scale.set(1,1.15,.85);addMesh(group,new THREE.ConeGeometry(.2*size,.45*size,5),armor,-.2*size,1.96*size,-.04);addMesh(group,new THREE.ConeGeometry(.2*size,.45*size,5),armor,.2*size,1.96*size,-.04);addMesh(group,new THREE.BoxGeometry(.13*size,.08*size,.08),red,-.14*size,1.67*size,.27*size,false);addMesh(group,new THREE.BoxGeometry(.13*size,.08*size,.08),red,.14*size,1.67*size,.27*size,false);for(let s of [-1,1]){const arm=addMesh(group,new THREE.CapsuleGeometry(.1*size,.52*size,3,6),armor,s*.48*size,.88*size,.02);arm.rotation.z=s*.3;}if(isBoss){for(let i=0;i<6;i++){const sp=addMesh(group,new THREE.ConeGeometry(.18,.95,5),red,(i-2.5)*.23,1.55*size,-.4);sp.rotation.x=-.8;}}const e={obj:group,x,z,health:isBoss?12:2,maxHealth:isBoss?12:2,boss:isBoss,attack:0,phase:Math.random()*5,dead:false};enemies.push(e);return e;}
function makeGate(x,z,c){const g=new THREE.Group();g.position.set(x,0,z);world.add(g);const portalMat=new THREE.MeshBasicMaterial({color:c.accent,transparent:true,opacity:.42,side:THREE.DoubleSide});const hoop=addMesh(g,new THREE.TorusGeometry(1.5,.12,8,32),glowMat,0,2,0,false);hoop.scale.y=1.4;const portal=addMesh(g,new THREE.CircleGeometry(1.38,32),portalMat,0,2,-.08,false);portal.scale.y=1.4;const base=addMesh(g,new THREE.CylinderGeometry(1.5,1.8,.35,8),mat(c.rock),0,.1,0);gate={obj:g,z,hoop,portal};}

function startChapter(index=0){chapter=index;state='playing';buildWorld(index);distance=0;score=0;shardCount=0;health=100;jumps=0;jumpVelocity=0;attackTimer=0;dashTimer=0;shieldTimer=0;lightningTimer=0;invulnTimer=0;hurtTimer=0;slideTimer=0;cooldowns={dash:0,shield:0,lightning:0};player.position.set(0,0,0);player.rotation.set(0,0,0);player.visible=true;playerParts.ring.visible=false;$('hud').classList.remove('hidden');$('chapter-number').textContent=`0${index+1}`;$('chapter-name').textContent=COLORS[index].name;$('objective-text').textContent=index===2?'Defeat the Veil Warden':'Reach the Veil Gate';$('shard-count').textContent='00';$('score-count').textContent='0000';$('health-fill').style.width='100%';$('objective-progress').style.width='0%';$('boss-bar').classList.toggle('hidden',index!==2);setScreen(null);toast(`CHAPTER 0${index+1} · ${COLORS[index].biome}`);playTone(360,.3,'sine',.04);}
function pauseGame(){if(state==='playing'){state='paused';setScreen('pause-screen');}else if(state==='paused'){state='playing';setScreen(null);}}
function finishChapter(win){if(state!=='playing')return;state=win?'won':'lost';$('hud').classList.add('hidden');$('boss-bar').classList.add('hidden');$('result-title').textContent=win?(chapter===2?'THE VEIL IS SEALED':'CHAPTER CLEARED'):'JOURNEY ENDED';$('result-eyebrow').textContent=win?'THE VEIL REMEMBERS':'THE SHADOWS CLOSE IN';$('result-copy').textContent=win?(chapter===2?'The Shadow World is yours to shape.':'A new path opens in the darkness.'):'The veil is patient. Gather your strength and return.';$('result-shards').textContent=`${String(shardCount).padStart(2,'0')} / ${String(maxShards).padStart(2,'0')}`;$('result-score').textContent=String(score).padStart(4,'0');$('result-next').style.display=win&&chapter<2?'flex':'none';$('result-next').querySelector('span').textContent=chapter===1?'FACE THE WARDEN':'NEXT CHAPTER';if(win){const old=Number(localStorage.getItem('shadow-unlocked')||0);localStorage.setItem('shadow-unlocked',String(Math.max(old,chapter+1)));playTone(660,.6,'triangle',.05);}else playTone(100,.65,'sawtooth',.04);setScreen('result-screen');}
function damage(amount){if(invulnTimer>0||shieldTimer>0||state!=='playing')return;health=Math.max(0,health-amount);invulnTimer=.9;hurtTimer=.25;shake=Math.max(shake,.32);player.material;playTone(95,.22,'sawtooth',.05);$('health-fill').style.width=`${health}%`;if(health<=0)finishChapter(false);}
function burst(position,color=COLORS[chapter].accent,count=12){for(let i=0;i<count;i++){const mesh=addMesh(scene,new THREE.OctahedronGeometry(.055+Math.random()*.06,0),new THREE.MeshBasicMaterial({color,transparent:true,opacity:1}),position.x,position.y,position.z,false);particles.push({obj:mesh,vel:new THREE.Vector3((Math.random()-.5)*5,Math.random()*4,(Math.random()-.5)*5),life:.5+Math.random()*.6});}}
function collectShard(s){const p=s.obj.position.clone();p.y+=1;burst(p,COLORS[chapter].accent,8);world.remove(s.obj);s.dead=true;shardCount++;score+=100;$('shard-count').textContent=String(shardCount).padStart(2,'0');$('score-count').textContent=String(score).padStart(4,'0');playTone(620,.12,'sine',.035);toast('+100 · VEIL SHARD');}
function removeEnemy(e){const pos=e.obj.position.clone();pos.y+=1;burst(pos,e.boss?0xff7580:0xffa277,e.boss?26:14);world.remove(e.obj);e.dead=true;score+=e.boss?1500:250;$('score-count').textContent=String(score).padStart(4,'0');if(e.boss){boss=null;$('boss-bar').classList.add('hidden');toast('THE WARDEN FALLS · THE VEIL GATE OPENS');playTone(110,.6,'sawtooth',.07);}else{toast('SENTINEL DISPELLED · +250');playTone(160,.17,'triangle',.035);}}
function attack(){if(state!=='playing'||performance.now()-lastAttack<370)return;lastAttack=performance.now();attackTimer=.28;playTone(240,.12,'triangle',.035);const reach=chapter===2&&boss?.z<distance+4?4.4:3.3;let hits=0;for(const e of enemies){if(e.dead)continue;const dx=e.x-player.position.x,dz=e.z-distance;if(Math.abs(dx)<2.1&&dz>-reach&&dz<reach){e.health-=1;hits++;e.obj.position.z+=.45;if(e.boss){$('boss-health').style.width=`${Math.max(0,e.health/e.maxHealth*100)}%`;shake=.17;}if(e.health<=0)removeEnemy(e);}}
 if(hits){score+=hits*25;$('score-count').textContent=String(score).padStart(4,'0');}}
function usePower(type){if(state!=='playing')return;if(type==='dash'&&cooldowns.dash<=0){dashTimer=.7;cooldowns.dash=4;invulnTimer=.85;shake=.15;burst(player.position.clone().add(new THREE.Vector3(0,1,0)),COLORS[chapter].accent,14);playTone(520,.22,'sawtooth',.03);toast('VEIL DASH');}
 if(type==='shield'&&cooldowns.shield<=0){shieldTimer=3.2;cooldowns.shield=9;playerParts.ring.visible=true;playTone(420,.3,'sine',.04);toast('PHASE SHIELD · 3 SECONDS');}
 if(type==='lightning'&&cooldowns.lightning<=0){lightningTimer=.3;cooldowns.lightning=11;playTone(780,.32,'sawtooth',.04);shake=.3;const bolt=addMesh(scene,new THREE.TorusGeometry(2.1,.07,5,28),new THREE.MeshBasicMaterial({color:0xb8fcff,transparent:true,opacity:.9}),player.position.x,1.1,distance+2,false);bolt.rotation.x=Math.PI/2;particles.push({obj:bolt,life:.36,ring:true});let killed=0;for(const e of enemies){if(e.dead)continue;if(Math.abs(e.x-player.position.x)<6&&Math.abs(e.z-distance)<8){e.health-=e.boss?4:3;killed++;if(e.boss)$('boss-health').style.width=`${Math.max(0,e.health/e.maxHealth*100)}%`;if(e.health<=0)removeEnemy(e);else burst(e.obj.position.clone().add(new THREE.Vector3(0,1,0)),0x91f6ff,8);}}toast(killed?'STORM CALL · SENTINELS STRUCK':'STORM CALL · POWER UNLEASHED');}}

function update(dt){gameTime+=dt;const active=state==='playing';const c=COLORS[chapter];
 // Gently animated environmental details continue behind the menus.
 for(const s of scenery){if(s.dust){const a=s.obj.geometry.attributes.position;const arr=a.array;for(let i=1;i<arr.length;i+=3){arr[i]+=.25*dt;if(arr[i]>13)arr[i]=-1;}a.needsUpdate=true;}else if(s.obj){if(s.obj.userData.float)s.obj.position.y=2+Math.sin(gameTime*1.6+(s.phase||0))*.18;if(s.sway)s.obj.rotation.z=Math.sin(gameTime*.75+s.sway)*.025;}}
 const blend=active?1:0; if(active){
   let move=0;if(keys.KeyA||keys.ArrowLeft)move-=1;if(keys.KeyD||keys.ArrowRight)move+=1;move+=touchMove;move=Math.max(-1,Math.min(1,move));
   const pace=dashTimer>0?14:slideTimer>0?10:7.7;distance=Math.min(stageLength+2,distance+pace*dt);if(chapter===2&&boss&&distance>77)distance=77;player.position.z=distance;player.position.x=THREE.MathUtils.damp(player.position.x,THREE.MathUtils.clamp(player.position.x+move*dt*7,-3.3,3.3),7,dt);
   if(move)player.rotation.y=THREE.MathUtils.damp(player.rotation.y,move*.11,9,dt);else player.rotation.y=THREE.MathUtils.damp(player.rotation.y,0,5,dt);
   if(jumpVelocity!==0||player.position.y>.005){jumpVelocity-=19*dt;player.position.y+=jumpVelocity*dt;if(player.position.y<=0){player.position.y=0;jumpVelocity=0;jumps=0;}}
   dashTimer=Math.max(0,dashTimer-dt);shieldTimer=Math.max(0,shieldTimer-dt);attackTimer=Math.max(0,attackTimer-dt);invulnTimer=Math.max(0,invulnTimer-dt);hurtTimer=Math.max(0,hurtTimer-dt);slideTimer=Math.max(0,slideTimer-dt);for(const k in cooldowns)cooldowns[k]=Math.max(0,cooldowns[k]-dt);playerParts.ring.visible=shieldTimer>0;
   const run=gameTime*(dashTimer>0?17:11);player.scale.y=slideTimer>0?.62:1;playerParts.leftLeg.rotation.x=Math.sin(run)*.48*(player.position.y<.1?1:0);playerParts.rightLeg.rotation.x=-Math.sin(run)*.48*(player.position.y<.1?1:0);playerParts.leftArm.rotation.x=-Math.sin(run)*.4;playerParts.rightArm.rotation.x=Math.sin(run)*.4-(attackTimer>0?1.8:0);playerParts.torso.position.y=1.05+(player.position.y<.08?Math.abs(Math.sin(run))*.035:0);playerParts.cloak.rotation.x=-.14+Math.sin(gameTime*5)*.045;
   player.visible=invulnTimer<=0||Math.floor(gameTime*18)%2===0;
   for(const s of shards){if(s.dead)continue;s.obj.rotation.y+=dt*1.4;s.obj.position.y=s.baseY+Math.sin(gameTime*2+s.phase)*.15;if(Math.abs(s.obj.position.z-distance)<1.35&&Math.abs(s.obj.position.x-player.position.x)<1.25&&player.position.y<2.1)collectShard(s);}
   for(const e of enemies){if(e.dead)continue;const dx=player.position.x-e.x,dz=distance-e.z;const dist=Math.hypot(dx,dz);e.obj.position.y=Math.sin(gameTime*4+e.phase)*.07;e.obj.rotation.y=Math.atan2(dx,-dz);if(dist<17&&dz>-.8){e.z+=dt*(e.boss?1.2:1.55);e.x+=Math.sign(dx)*Math.min(Math.abs(dx),dt*(e.boss?1.8:2.5));e.obj.position.z=e.z;e.obj.position.x=e.x;}if(dist<(e.boss?2.3:1.55)&&Math.abs(dz)<1.8){e.attack+=dt;if(e.attack>1.1){e.attack=0;if(shieldTimer<=0)damage(e.boss?15:10);}}else e.attack=Math.min(e.attack,.65);}
   for(const o of obstacles){if(slideTimer<=0&&Math.abs(o.z-distance)<o.r+.4&&Math.abs(o.x-player.position.x)<o.r+.45&&player.position.y<.8){damage(13);player.position.z=Math.max(0,distance-.7);distance=player.position.z;}}
   if(Math.abs(player.position.x)>3.15)damage(9);
   if(boss){$('boss-health').style.width=`${Math.max(0,boss.health/boss.maxHealth*100)}%`;}
   $('objective-progress').style.width=`${Math.min(100,distance/stageLength*100)}%`;
   if(distance>=stageLength-2){if(chapter===2&&boss){if(!boss.dead){}else finishChapter(true);}else finishChapter(true);}
   if(chapter===2&&distance>stageLength-1&&boss)distance=stageLength-1;
   $('health-fill').style.width=`${health}%`;
 }
 // Power cooldown overlays, cinematic follow cam, and ambient light.
 for(const [id,key,max] of [['power-dash','dash',4],['power-shield','shield',9],['power-lightning','lightning',11]]){const el=$(id).querySelector('.cooldown');el.style.height=`${cooldowns[key]/max*100}%`;}
 const target=new THREE.Vector3(player.position.x*.37,2.4+player.position.y*.5,distance+5.5);camera.position.x=THREE.MathUtils.damp(camera.position.x,player.position.x*.32,3.2,dt);camera.position.y=THREE.MathUtils.damp(camera.position.y,4.2+player.position.y*.25,2.3,dt);camera.position.z=THREE.MathUtils.damp(camera.position.z,distance-8.8,3.5,dt);if(shakeEnabled&&shake>0){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;shake=Math.max(0,shake-dt*.9);}camera.lookAt(target);
 fill.position.set(player.position.x+3,4,distance+3);fill.intensity=active?27:18;
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.vel){p.obj.position.addScaledVector(p.vel,dt);p.vel.y-=7*dt;}if(p.ring){p.obj.scale.multiplyScalar(1+dt*2);p.obj.material.opacity=Math.max(0,p.life*2.7);}else if(p.obj.material?.transparent)p.obj.material.opacity=Math.max(0,p.life);if(p.life<=0){scene.remove(p.obj);p.obj.geometry.dispose();if(p.obj.material.dispose)p.obj.material.dispose();particles.splice(i,1);}}
 if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('show');}
}
function animate(){requestAnimationFrame(animate);const dt=Math.min(.04,clock.getDelta());update(dt);renderer.render(scene,camera);}
// Input is deliberately simple and immediate so keyboard, gamepad-like touch buttons, and mouse all share the same actions.
function jump(){if(state!=='playing')return;if(jumps<2){jumpVelocity=jumps===0?8.2:7.3;jumps++;player.position.y=Math.max(.04,player.position.y);playTone(jumps===1?360:520,.1,'sine',.03);if(jumps===2)burst(player.position.clone().add(new THREE.Vector3(0,.35,0)),COLORS[chapter].accent,7);}}
function slide(){if(state==='playing'){slideTimer=.72;playTone(180,.13,'triangle',.022);}}
window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.repeat)return;keys[e.code]=true;if(e.code==='Escape'){if(state==='playing'||state==='paused')pauseGame();else if(state==='menu')showSettings();return;}if(state!=='playing')return;if(e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW')jump();if(e.code==='KeyJ'||e.code==='Enter')attack();if(e.code==='ShiftLeft'||e.code==='ShiftRight')usePower('dash');if(e.code==='KeyQ')usePower('shield');if(e.code==='KeyE')usePower('lightning');if(e.code==='KeyC')slide();});
window.addEventListener('keyup',e=>{keys[e.code]=false;});
$('play-btn').addEventListener('click',()=>startChapter(0));$('levels-btn').addEventListener('click',showLevels);$('settings-btn').addEventListener('click',showSettings);
document.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>setScreen(b.dataset.back)));
$('hud-menu').addEventListener('click',pauseGame);$('pause-btn').addEventListener('click',pauseGame);$('resume-btn').addEventListener('click',pauseGame);
$('restart-btn').addEventListener('click',()=>startChapter(chapter));$('quit-btn').addEventListener('click',showMenu);$('result-title-btn').addEventListener('click',showMenu);$('result-next').addEventListener('click',()=>startChapter(Math.min(2,chapter+1)));
$('power-dash').addEventListener('click',()=>usePower('dash'));$('power-shield').addEventListener('click',()=>usePower('shield'));$('power-lightning').addEventListener('click',()=>usePower('lightning'));
$('sound-toggle').addEventListener('click',e=>{soundEnabled=!soundEnabled;e.currentTarget.classList.toggle('on',soundEnabled);e.currentTarget.textContent=soundEnabled?'ON':'OFF';if(soundEnabled)playTone(440,.1);});
$('shake-toggle').addEventListener('click',e=>{shakeEnabled=!shakeEnabled;e.currentTarget.classList.toggle('on',shakeEnabled);e.currentTarget.textContent=shakeEnabled?'ON':'OFF';});
$('quality-select').addEventListener('change',e=>{const low=e.target.value==='low',balanced=e.target.value==='balanced';renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,low?1:balanced?1.3:1.7));renderer.shadowMap.enabled=!low;renderer.setSize(innerWidth,innerHeight);});
const joystick=$('joystick'),joyKnob=$('joy-knob');let joyPointer=null;function moveJoystick(e){const r=joystick.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),range=22;touchMove=THREE.MathUtils.clamp(dx/range,-1,1);joyKnob.style.transform=`translateX(${touchMove*range}px)`;}joystick.addEventListener('pointerdown',e=>{e.preventDefault();joyPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);moveJoystick(e);});joystick.addEventListener('pointermove',e=>{if(e.pointerId===joyPointer)moveJoystick(e);});function resetJoystick(){joyPointer=null;touchMove=0;joyKnob.style.transform='translateX(0)';}joystick.addEventListener('pointerup',resetJoystick);joystick.addEventListener('pointercancel',resetJoystick);joystick.addEventListener('lostpointercapture',resetJoystick);
document.querySelectorAll('.mobile-controls [data-action]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();const a=b.dataset.action;if(a==='jump')jump();else if(a==='attack')attack();else if(a==='slide')slide();else usePower(a);});});
window.addEventListener('blur',()=>{keys={};touchMove=0;if(state==='playing')pauseGame();});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));});
// Build the first landscape before dismissing the title's loading treatment.
buildWorld(0);setTimeout(()=>$('loading-screen').classList.add('done'),850);
animate();
