import {Engine} from '@babylonjs/core/Engines/engine';
import {Scene} from '@babylonjs/core/scene';
import {Color3,Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3,Matrix,Quaternion} from '@babylonjs/core/Maths/math.vector';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {DirectionalLight} from '@babylonjs/core/Lights/directionalLight';
import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {Camera} from '@babylonjs/core/Cameras/camera';
import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture';
import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import {CreateGround} from '@babylonjs/core/Meshes/Builders/groundBuilder';
import {CreateTube} from '@babylonjs/core/Meshes/Builders/tubeBuilder';
import {CreateIcoSphere} from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import '@babylonjs/core/Culling/ray';
const MeshBuilder={CreateBox,CreateSphere,CreateGround,CreateTube,CreateIcoSphere,CreateCylinder};
import {COLORS,PALETTE,MODELS,ELEVATION,ENTRY_SECONDS,BOARD_SECONDS,CELEBRATION_SECONDS,DEPART_SECONDS,ground,screen,direction,rng,type ModelId,type ColorId,type VehicleSpec,type Simulation} from './logic';
import {gameViewport,type GameViewport} from './viewport';

const V=(x:number,y:number,z:number)=>new Vector3(x,y,z);
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const ease=(t:number)=>t*t*(3-2*t);
function at(sx:number,sy:number,y=0){const p=ground(sx,sy);return V(p.x,y,p.z);}
const materialCaches=new WeakMap<Scene,Map<string,StandardMaterial>>();
function material(scene:Scene,name:string,color:string,gloss=.25){let cache=materialCaches.get(scene);if(!cache){cache=new Map();materialCaches.set(scene,cache);}const key=color+'-'+gloss,existing=cache.get(key);if(existing)return existing;const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=new Color3(gloss,gloss,gloss);m.specularPower=68;m.ambientColor=new Color3(.12,.12,.12);cache.set(key,m);return m;}

/** Beveled cuboid with genuine rounded geometry, reused by every color of each vehicle. */
function rounded(scene:Scene,name:string,w:number,h:number,l:number,r:number){
  if(Math.min(w,h,l)<.07||Math.max(w,h,l)<.21)return MeshBuilder.CreateBox(name,{width:w,height:h,depth:l},scene);
  const sizes=[w/2,h/2,l/2],positions:number[]=[],normals:number[]=[],indices:number[]=[];
  const coords=(a:number)=>[-a,-a+r*.134,-a+r*.5,-a+r,a-r,a-r*.5,a-r*.134,a];
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const u=(axis+1)%3,v=(axis+2)%3,us=coords(sizes[u]),vs=coords(sizes[v]);const start=positions.length/3;
    for(const a of us)for(const b of vs){const p=[0,0,0];p[axis]=sizes[axis]*sign;p[u]=a;p[v]=b;const q=p.map((n,i)=>clamp(n,-sizes[i]+r,sizes[i]-r));let n=p.map((n,i)=>n-q[i]);const d=Math.hypot(...n)||1;n=n.map(x=>x/d);positions.push(...q.map((x,i)=>x+n[i]*r));normals.push(...n);}
    for(let a=0;a<7;a++)for(let b=0;b<7;b++){const i=start+a*8+b;if(sign>0)indices.push(i,i+1,i+8,i+1,i+9,i+8);else indices.push(i,i+8,i+1,i+1,i+8,i+9);}
  }
  const mesh=new Mesh(name,scene),data=new VertexData();data.positions=positions;data.normals=normals;data.indices=indices;data.applyToMesh(mesh);return mesh;
}
function merge(name:string,meshes:Mesh[]){for(const m of meshes)if(!m.isVerticesDataPresent(VertexBuffer.UVKind))m.setVerticesData(VertexBuffer.UVKind,new Float32Array(m.getTotalVertices()*2));const mesh=Mesh.MergeMeshes(meshes,true,true,undefined,false,false)!;mesh.name=name;return mesh;}
function arrow(scene:Scene,name:string,size=1){const p=[[-.12,-.57],[.12,-.57],[.12,.20],[.31,.20],[0,.59],[-.31,.20],[-.12,.20]];const positions=p.flatMap(([x,z])=>[x*size,0,z*size]);const indices=[0,1,2,0,2,6,2,3,4,2,4,6,4,5,6];const mesh=new Mesh(name,scene);const vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.normals=p.flatMap(()=>[0,1,0]);vd.applyToMesh(mesh);return mesh;}

type CarVisual={root:TransformNode;arrows:Mesh[];shadow:Mesh;spec:VehicleSpec;nudge:number;previous:Vector3;smoke:number};
type Puff={mesh:Mesh;life:number;max:number;vel:Vector3;size:number;confetti:boolean};
export class GameScene{
  readonly engine:Engine;readonly scene:Scene;readonly camera:FreeCamera;
  cars:CarVisual[]=[];private prototypes=new Map<string,Mesh[]>();private crowdMasters=new Map<ColorId,Mesh>();private crowdMatrices=new Map<ColorId,Float32Array>();private crowdCounts=new Map<ColorId,number>();
  private pools:Puff[]=[];private props:Mesh[]=[];private roads:Mesh[]=[];private smokeMaster:Mesh;private confettiMasters:Mesh[]=[];
  private random=rng(311);private shadowMat:StandardMaterial;private mtx=Matrix.Identity();private quat=Quaternion.Identity();private scl=V(1,1,1);
  private routeCache=new Map<string,Vector3[]>();private shuffleStarts=new Map<number,{position:Vector3;yaw:number}>();
  onVehicle:(id:number)=>void=()=>{};sim?:Simulation;
  private layout=gameViewport(592,1280);
  constructor(readonly canvas:HTMLCanvasElement){
    this.engine=new Engine(canvas,true,{preserveDrawingBuffer:false,stencil:false,powerPreference:'high-performance',antialias:true},false);
    this.setQuality();
    this.scene=new Scene(this.engine);this.scene.clearColor=new Color4(.81,.84,.91,1);this.scene.skipPointerMovePicking=true;
    this.scene.imageProcessingConfiguration.contrast=1;this.scene.imageProcessingConfiguration.exposure=1;
    this.camera=new FreeCamera('locked-portrait-camera',V(0,30,-30/Math.tan(ELEVATION)),this.scene);this.camera.setTarget(Vector3.Zero());this.camera.mode=Camera.ORTHOGRAPHIC_CAMERA;this.camera.orthoLeft=-5.92;this.camera.orthoRight=5.92;this.camera.orthoTop=12.8;this.camera.orthoBottom=-12.8;this.camera.minZ=.1;this.camera.maxZ=100;
    const ambient=new HemisphericLight('soft-sky',V(-.3,1,-.3),this.scene);ambient.intensity=.58;ambient.groundColor=Color3.FromHexString('#8090A9');
    const sun=new DirectionalLight('large-softbox',V(.45,-1,.4),this.scene);sun.intensity=.50;sun.diffuse=new Color3(1,.995,.98);
    const shadowTexture=new DynamicTexture('soft-contact-shadow',{width:128,height:128},this.scene,false);const ctx=shadowTexture.getContext();const grad=ctx.createRadialGradient(64,64,10,64,64,63);grad.addColorStop(0,'rgba(21,31,50,.46)');grad.addColorStop(.50,'rgba(21,31,50,.22)');grad.addColorStop(1,'rgba(21,31,50,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);shadowTexture.update();this.shadowMat=new StandardMaterial('shadow',this.scene);this.shadowMat.diffuseTexture=shadowTexture;this.shadowMat.opacityTexture=shadowTexture;this.shadowMat.disableLighting=true;this.shadowMat.emissiveColor=Color3.White();this.shadowMat.backFaceCulling=false;
    const smokeTexture=new DynamicTexture('soft-exhaust',{width:128,height:128},this.scene,false);const smokeContext=smokeTexture.getContext();
    for(const [x,y,r,alpha] of [[64,64,61,.24],[43,55,40,.20],[82,60,39,.20],[62,37,36,.18]]){const fog=smokeContext.createRadialGradient(x,y,0,x,y,r);fog.addColorStop(0,`rgba(230,237,246,${alpha})`);fog.addColorStop(.45,`rgba(223,232,244,${alpha*.7})`);fog.addColorStop(1,'rgba(235,242,250,0)');smokeContext.fillStyle=fog;smokeContext.fillRect(0,0,128,128);}smokeTexture.hasAlpha=true;smokeTexture.update();
    const smokeMat=new StandardMaterial('soft-exhaust-material',this.scene);smokeMat.diffuseTexture=smokeTexture;smokeMat.useAlphaFromDiffuseTexture=true;smokeMat.disableLighting=true;smokeMat.emissiveColor=Color3.White();smokeMat.backFaceCulling=false;smokeMat.disableDepthWrite=true;
    this.smokeMaster=MeshBuilder.CreateGround('smoke-master',{width:1,height:1},this.scene);this.smokeMaster.rotation.x=Math.PI/2;this.smokeMaster.bakeCurrentTransformIntoVertices();this.smokeMaster.billboardMode=Mesh.BILLBOARDMODE_ALL;this.smokeMaster.material=smokeMat;this.smokeMaster.isVisible=false;this.smokeMaster.isPickable=false;
    for(const color of COLORS){const m=MeshBuilder.CreateBox('confetti-master-'+color,{width:.05,height:.013,depth:.10},this.scene);m.material=material(this.scene,'confetti-'+color,PALETTE[color],0);m.isVisible=false;m.isPickable=false;this.confettiMasters.push(m);}
    this.buildEnvironment();const staticGroups=new Map<StandardMaterial,Mesh[]>();for(const m of [...this.scene.meshes])if(m instanceof Mesh&&m.isVisible&&m.material){const mat=m.material as StandardMaterial;staticGroups.set(mat,[...(staticGroups.get(mat)||[]),m]);}for(const ms of staticGroups.values()){const m=ms.length>1?merge('static-scenery',ms):ms[0];m.isPickable=false;m.freezeWorldMatrix();}this.buildCrowdMasters();
    let pressed:{x:number;y:number;id:number}|null=null;
    this.canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();pressed={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);});
    this.canvas.addEventListener('pointercancel',()=>{pressed=null;});
    this.canvas.addEventListener('pointerup',e=>{if(e.button!==0||!pressed||pressed.id!==e.pointerId)return;e.preventDefault();const moved=Math.hypot(e.clientX-pressed.x,e.clientY-pressed.y);pressed=null;if(moved>24)return;
      const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
      // Babylon converts CSS coordinates to render pixels internally: never multiply by DPR twice.
      const pick=this.scene.pick(x,y,m=>m.metadata?.vehicleId!==undefined&&this.sim?.cars[m.metadata.vehicleId]?.status==='yard');
      if(pick?.hit&&pick.pickedMesh){this.onVehicle(pick.pickedMesh.metadata.vehicleId);return;}
      const sx=(x-this.layout.left)/this.layout.scale,sy=(y-this.layout.top)/this.layout.scale,pad=10/this.layout.scale;
      const candidates=this.cars.filter(c=>this.sim?.cars[c.spec.id].status==='yard').map(c=>{
        const dim=MODELS[c.spec.model],w=dim.width*c.spec.scale/2,l=dim.length*c.spec.scale/2,d=direction(c.root.rotation.y),corners=[[-w,-l],[w,-l],[w,l],[-w,l]].map(([a,b])=>screen({x:c.root.position.x+d.z*a+d.x*b,z:c.root.position.z-d.x*a+d.z*b,y:dim.height*c.spec.scale*.75}));
        let inside=false,edge=Infinity;for(let i=0,j=3;i<4;j=i++){const a=corners[j],b=corners[i];if((a.y>sy)!==(b.y>sy)&&sx<(b.x-a.x)*(sy-a.y)/(b.y-a.y)+a.x)inside=!inside;const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((sx-a.x)*dx+(sy-a.y)*dy)/(dx*dx+dy*dy),0,1);edge=Math.min(edge,Math.hypot(sx-a.x-t*dx,sy-a.y-t*dy));}return{c,d:inside?0:edge};
      }).sort((a,b)=>a.d-b.d);
      if(candidates[0]&&candidates[0].d<=pad)this.onVehicle(candidates[0].c.spec.id);
    });
  }
  private buildEnvironment(){
    const floor=MeshBuilder.CreateGround('lavender-yard',{width:200,height:100},this.scene);const floorMaterial=material(this.scene,'yard','#FFFFFF',.015);const floorTexture=new DynamicTexture('lavender-gradient',{width:8,height:256},this.scene,false);const fc=floorTexture.getContext(),fg=fc.createLinearGradient(0,0,0,256);fg.addColorStop(0,'#DFE7FB');fg.addColorStop(1,'#CAD0E0');fc.fillStyle=fg;fc.fillRect(0,0,8,256);floorTexture.update();floorMaterial.diffuseTexture=floorTexture;floor.material=floorMaterial;floor.isPickable=false;
    const grass=MeshBuilder.CreateGround('lawn',{width:200,height:60},this.scene);grass.position=at(296,78,.006);grass.position.z+=(60-12.8)/2;grass.material=material(this.scene,'grass','#A4CC79',.01);grass.isPickable=false;
    const apron=MeshBuilder.CreateGround('boarding-apron',{width:200,height:4.05},this.scene);apron.position=at(296,480,.015);apron.material=material(this.scene,'asphalt','#797D90',.025);apron.isPickable=false;
    this.line('apron-bottom',[[-4704,572],[5296,572]],'#F0F0FA',.035,.027);
    this.line('apron-top-left',[[0,462],[29,398],[53,384],[240,384]],'#EFF0F7',.04,.03);
    this.line('apron-top-right',[[352,384],[538,384],[565,398],[592,462]],'#EFF0F7',.04,.03);
    for(let i=0;i<8;i++){const cx=94+i*59,cy=467,angle=-.32;const points:number[][]=[];for(let j=0;j<=40;j++){const a=j/40*Math.PI*2;const x=Math.sign(Math.cos(a))*Math.pow(Math.abs(Math.cos(a)),.23)*20;const y=Math.sign(Math.sin(a))*Math.pow(Math.abs(Math.sin(a)),.23)*37;points.push([cx+x*Math.cos(angle)-y*Math.sin(angle),cy+x*Math.sin(angle)+y*Math.cos(angle)]);}this.line('bay-'+i,points,i===0?'#FFD34C':i>4?'#A1CCB7':'#C4CBDB',.017,.032);}
    const leaf=material(this.scene,'bush-leaves','#73A553',.02),darkleaf=material(this.scene,'bush-base','#5E8D47',.02),flower=material(this.scene,'flower-pink','#FFE0C0',0),white=material(this.scene,'flower-white','#FBF9E0',0);
    for(const [sx,sy]of[[14,310],[583,310],[465,285],[131,90],[444,102]]){
      const p=at(sx,sy,.08);for(let i=0;i<3;i++){const b=MeshBuilder.CreateIcoSphere('shrub',{radius:.16+this.random()*.12,subdivisions:1},this.scene);b.position=p.add(V((this.random()-.5)*.25,.11+i*.05,(this.random()-.5)*.2));b.scaling.y=.8;b.material=i===0?darkleaf:leaf;b.isPickable=false;}
    }
    for(const side of [0,1])for(let i=0;i<21;i++){const sx=(side?490:65)+(this.random()-.5)*75,sy=353+(this.random()-.5)*28;const m=MeshBuilder.CreateSphere('flower',{diameter:.055+this.random()*.04,segments:4},this.scene);m.position=at(sx,sy,.085);m.material=i%3===0?flower:white;m.isPickable=false;}
    for(let i=0;i<38;i++){const sx=this.random()*592,sy=this.random()*365;const b=MeshBuilder.CreateIcoSphere('lawn-fleck',{radius:.025+this.random()*.03,subdivisions:0},this.scene);b.position=at(sx,sy,.025);b.scaling.y=.3;b.material=i%4?leaf:white;b.isPickable=false;}
  }
  private line(name:string,points:number[][],color:string,radius:number,y:number){const m=MeshBuilder.CreateTube(name,{path:points.map(p=>at(p[0],p[1],y)),radius,tessellation:5,cap:0},this.scene);m.material=material(this.scene,name+'-mat',color,.015);m.isPickable=false;return m;}
  private roadPath(name:string,points:number[][],halfWidth:number,curbs=true){
    const positions:number[]=[],indices:number[]=[];const count=points.length;
    for(let i=0;i<count;i++){const a=points[Math.max(0,i-1)],b=points[Math.min(count-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;for(const s of [-1,1]){const p=at(points[i][0]-dy/len*halfWidth*s,points[i][1]+dx/len*halfWidth*s,.025);positions.push(p.x,p.y,p.z);}if(i<count-1){const j=i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3);}}
    const vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.normals=positions.flatMap((_,i)=>i%3===0?[0,1,0]:[]);const mesh=new Mesh(name,this.scene);vd.applyToMesh(mesh);const m=material(this.scene,name+'-mat','#7B7F91',.025);m.backFaceCulling=false;mesh.material=m;mesh.isPickable=false;this.roads.push(mesh);
    if(curbs)for(const side of [-1,1]){const edge=points.map((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(count-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;return[p[0]-dy/len*halfWidth*side,p[1]+dx/len*halfWidth*side];});this.roads.push(this.line(name+'-curb',edge,'#E9EBF4',.038,.043));}
  }
  private rebuildRoads(level:number){for(const m of this.roads)m.dispose();this.roads=[];
    const loop=Array.from({length:97},(_,i)=>{const a=i/96*Math.PI*2;return[296+Math.cos(a)*165,259+Math.sin(a)*91];});this.roadPath('circulating-loop',loop,38,false);
    this.roads.push(this.line('island-curb',Array.from({length:97},(_,i)=>{const a=i/96*Math.PI*2;return[296+Math.cos(a)*127,259+Math.sin(a)*53];}),'#E9EBF4',.045,.05));
    for(const [start,end]of[[0,1.31],[1.83,6.283]])this.roads.push(this.line('outer-loop-curb',Array.from({length:80},(_,i)=>{const a=start+(end-start)*i/79;return[296+Math.cos(a)*203,259+Math.sin(a)*129];}),'#E9EBF4',.04,.045));
    const right=Array.from({length:49},(_,i)=>{const p=this.feederCenter(i/48,1);return[p.x,p.y];});this.roadPath('right-feeder',right,44);
    if(level>=3){const left=right.map(p=>[592-p[0],p[1]]);this.roadPath('left-feeder',left,44);}
    this.roadPath('service-gate',[[296,351],[296,370],[296,389]],49,false);
    for(const x of [247,345])this.roads.push(this.line('gate-curb',[[x,376],[x,390]],'#E9EBF4',.04,.045));
  }
  private model(model:ModelId,color:ColorId):Mesh[]{
    const key=model+'-'+color,existing=this.prototypes.get(key);if(existing)return existing;const dim=MODELS[model],parts:Record<string,Mesh[]>={paint:[],glass:[],dark:[],light:[],arrows:[],chrome:[],red:[],shine:[]};
    const box=(category:string,name:string,w:number,h:number,l:number,r:number,x:number,y:number,z:number)=>{const m=rounded(this.scene,name,w,h,l,Math.min(r,w/2,h/2,l/2)*.98);m.position=V(x,y,z);parts[category].push(m);return m;};
    const w=dim.width,l=dim.length,h=dim.height;
    box('paint','rounded-lower-body',w,h*.60,l,.12,0,.27,0);
    if(model==='car'){
      box('glass','inset-cabin-glass',w*.79,.32,l*.57,.065,0,.55,-.07);
      box('paint','cabin-roof',w*.76,.13,l*.31,.05,0,.735,-.06);
      box('paint','hood',w*.92,.09,l*.25,.045,0,.48,l*.32);
      for(const x of [-w*.37,w*.37])box('paint','window-pillar',.07,.29,.07,.025,x,.57,0);
    }else{
      box('paint','upper-rounded-body',w*.95,h*.67,l*.94,.12,0,h*.75,0);
      box('glass','windscreen',w*.81,.27,.037,.018,0,h*.83,l*.476);
      box('glass','rear-glass',w*.72,.20,.036,.016,0,h*.8,-l*.476);
      const windows=model==='bus'?4:3;
      for(const side of [-1,1])for(let i=0;i<windows;i++){box('glass','side-window',.032,.22,l*.67/windows-.055,.014,side*w*.479,h*.79,-l*.30+i*l*.67/windows);}
      box('paint','roof-hatch',w*.38,.043,l*.14,.025,0,h*1.10,-l*.26);
    }
    for(const side of [-1,1]){
      for(const z of [-l*.31,l*.31]){const tire=MeshBuilder.CreateCylinder('tire',{height:.13,diameter:.30,tessellation:20},this.scene);tire.rotation.z=Math.PI/2;tire.position=V(side*w*.46,.16,z);parts.dark.push(tire);const hub=MeshBuilder.CreateCylinder('hub',{height:.015,diameter:.15,tessellation:16},this.scene);hub.rotation.z=Math.PI/2;hub.position=V(side*(w*.46+.075),.16,z);parts.chrome.push(hub);}
      box('light','headlight',w*.16,.075,.025,.02,side*w*.31,.28,l*.506);
      box('red','tail-light',w*.14,.060,.027,.017,side*w*.31,.28,-l*.505);
      box('paint','mirror',.12,.10,.17,.04,side*w*.52,h*.71,l*.32);
    }
    box('chrome','bumper',w*.78,.055,.035,.008,0,.18,l*.515);
    for(const side of [-1,1]){box('chrome','door-handle',.018,.025,.14,.006,side*w*.486,h*.54,l*.21);box('shine','body-highlight',.018,.018,l*.69,.004,side*w*.49,h*.59,0);}
    if(model!=='car'){box('shine','windshield-reflection',w*.58,.032,.012,.004,-w*.055,h*.96,l*.498);box('dark','passenger-door-seam',.012,h*.53,.018,.004,w*.483,h*.65,l*.31);}
    const arrowY=model==='car'?.815:h*1.14+.012;const border=arrow(this.scene,'arrow-outline',model==='car'?.78:1.05);border.position.y=arrowY;parts.arrows.push(border);const ink=arrow(this.scene,'arrow-white',model==='car'?.69:.94);ink.position.y=arrowY+.01;parts.light.push(ink);
    const mats={paint:material(this.scene,key+'-paint',PALETTE[color],.58),glass:material(this.scene,key+'-windows',color==='cyan'?'#157AA2':'#245881',.52),dark:material(this.scene,key+'-rubber','#344357',.13),light:material(this.scene,'warm-white','#FCFFFF',.12),arrows:material(this.scene,'arrow-edge','#344253',0),chrome:material(this.scene,'satin-chrome','#B8CCDF',.66),red:material(this.scene,'tail-lamp','#F44339',.5),shine:material(this.scene,key+'-reflection',Color3.Lerp(Color3.FromHexString(PALETTE[color]),Color3.White(),.6).toHexString(),.5)};
    const meshes=Object.entries(parts).filter(([,v])=>v.length).map(([category,ms])=>{const m=merge(key+'-'+category,ms);m.material=mats[category as keyof typeof mats];m.isVisible=false;m.isPickable=false;return m;});
    this.prototypes.set(key,meshes);return meshes;
  }
  private buildCrowdMasters(){for(const color of COLORS){const parts:Mesh[]=[];
    const sphere=(name:string,x:number,y:number,z:number,w:number,h:number,d:number)=>{const m=MeshBuilder.CreateSphere(name,{diameter:1,segments:name==='head'?7:3},this.scene);m.scaling=V(w,h,d);m.position=V(x,y,z);parts.push(m);};
    sphere('head',0,.46,0,.38,.36,.36);sphere('torso',0,.25,0,.29,.31,.23);sphere('arm',-.16,.25,.01,.10,.23,.11);sphere('arm',.16,.25,.01,.10,.23,.11);sphere('foot',-.075,.07,.025,.12,.14,.16);sphere('foot',.075,.07,.025,.12,.14,.16);
    const mesh=merge('passenger-'+color,parts);mesh.material=material(this.scene,'passenger-mat-'+color,PALETTE[color],.13);mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.thinInstanceEnablePicking=false;const buffer=new Float32Array(16*650);mesh.thinInstanceSetBuffer('matrix',buffer,16,false);mesh.thinInstanceCount=0;this.crowdMasters.set(color,mesh);this.crowdMatrices.set(color,buffer);}
  }
  load(sim:Simulation){this.sim=sim;this.routeCache.clear();this.shuffleStarts.clear();for(const c of this.cars){c.root.dispose();c.shadow.dispose();}this.cars=[];for(const p of this.pools)p.mesh.dispose();this.pools=[];this.rebuildRoads(sim.level.id);
    for(const spec of sim.level.vehicles){const root=new TransformNode('vehicle-'+spec.id,this.scene);root.position=V(spec.x,.03,spec.z);root.rotation.y=spec.yaw;root.scaling.setAll(spec.scale);const arrows:Mesh[]=[];
      for(const master of this.model(spec.model,spec.color)){const m=master.createInstance('vehicle-part-'+spec.id);m.parent=root;m.metadata={vehicleId:spec.id};m.isPickable=true;}
      const shadow=MeshBuilder.CreateGround('vehicle-shadow',{width:MODELS[spec.model].width*1.4,height:MODELS[spec.model].length*1.20},this.scene);shadow.material=this.shadowMat;shadow.isPickable=false;shadow.position=V(spec.x+.04,.026,spec.z-.06);shadow.rotation.y=spec.yaw;shadow.scaling.setAll(spec.scale);
      this.cars.push({root,arrows,shadow,spec,nudge:0,previous:root.position.clone(),smoke:0});
    }
  }
  animateShuffle(){this.routeCache.clear();this.shuffleStarts.clear();for(const c of this.cars)if(this.sim?.cars[c.spec.id].status==='yard')this.shuffleStarts.set(c.spec.id,{position:c.root.position.clone(),yaw:c.root.rotation.y});}
  bayPosition(bay:number){return at(94+bay*59,466,.025);}
  nudge(id:number){if(this.cars[id])this.cars[id].nudge=.32;}
  private curve(a:Vector3,b:Vector3,c:Vector3,d:Vector3,t:number){const u=1-t;return a.scale(u*u*u).add(b.scale(3*u*u*t)).add(c.scale(3*u*t*t)).add(d.scale(t*t*t));}
  private transferPath(spec:VehicleSpec,bay:number){
    const key=spec.id+'-'+bay,cached=this.routeCache.get(key);if(cached)return cached;
    const d=direction(spec.yaw),start=V(spec.x,.03,spec.z),top=ground(296,592).z,bottom=ground(296,1140).z;
    const distances:number[]=[];if(d.x>.001)distances.push((6.35-start.x)/d.x);if(d.x<-.001)distances.push((-6.35-start.x)/d.x);if(d.z>.001)distances.push((top-start.z)/d.z);if(d.z<-.001)distances.push((bottom-start.z)/d.z);
    const distance=Math.max(.2,Math.min(...distances.filter(v=>v>0)))+.35;const exit=start.add(V(d.x*distance,0,d.z*distance)),target=this.bayPosition(bay);const points=[start,exit];
    if(exit.z<top-.3){const side=exit.x<0?-6.65:6.65;points.push(V(side,.03,exit.z),V(side,.03,ground(296,551).z));}
    points.push(target.add(V(.45,0,-1.05)),target);const smooth=[points[0]];
    for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1],r=Math.min(.4,Vector3.Distance(a,b)*.3,Vector3.Distance(b,c)*.3),entry=b.add(a.subtract(b).normalize().scale(r)),end=b.add(c.subtract(b).normalize().scale(r));smooth.push(entry);for(let j=1;j<=6;j++){const f=j/6;smooth.push(entry.scale((1-f)*(1-f)).add(b.scale(2*(1-f)*f)).add(end.scale(f*f)));}}
    smooth.push(target);this.routeCache.set(key,smooth);return smooth;
  }
  private along(points:Vector3[],t:number){const lengths=points.slice(1).map((p,i)=>Vector3.Distance(p,points[i]));const total=lengths.reduce((a,b)=>a+b,0);let d=clamp(t,0,.999999)*total;for(let i=0;i<lengths.length;i++){if(d<=lengths[i])return Vector3.Lerp(points[i],points[i+1],d/lengths[i]);d-=lengths[i];}return points.at(-1)!;}
  vehiclePosition(id:number){return this.cars[id].root.position;}
  burst(id:number){const p=this.bayPosition(this.sim!.cars[id].bay);for(let i=0;i<32;i++)this.particle(p,true);}
  private particle(p:Vector3,confetti=false){if(this.pools.length>150)return;
    const source=confetti?this.confettiMasters[Math.floor(this.random()*8)]:this.smokeMaster;
    const m=confetti?source.createInstance('bus-confetti'):source.clone('exhaust-puff',null,true)!;m.isVisible=true;m.isPickable=false;m.position=p.clone();m.position.y=confetti?.9:.17;
    const size=confetti?.7+this.random()*.5:.20+this.random()*.15;m.scaling.setAll(size);const max=confetti?CELEBRATION_SECONDS:.65+this.random()*.25;
    this.pools.push({mesh:m as Mesh,life:max,max,size,confetti,vel:V((this.random()-.5)*(confetti?.65:.16),confetti?1.0+this.random()*.55:.26+this.random()*.15,(this.random()-.5)*(confetti?.45:.16))});
  }
  private personPoint(phase:number,lane:number){const a=phase*Math.PI*2,offset=(lane-1.5)*15,dx=-165*Math.sin(a),dy=91*Math.cos(a),len=Math.hypot(dx,dy);return at(296+Math.cos(a)*165+dy/len*offset,259+Math.sin(a)*91-dx/len*offset,.04);}
  private feederCenter(t:number,side:number){const endX=296+Math.cos(.9*Math.PI*2)*165,endY=259+Math.sin(.9*Math.PI*2)*91;return{x:side?553+(endX-553)*t*t:39-(endX-553)*t*t,y:-110+2*(1-t)*t*215+t*t*(endY+110)};}
  private feederPoint(row:number,lane:number,side:number){const t=clamp(.70-row*.041,0,1),p=this.feederCenter(t,side),a=this.feederCenter(Math.max(0,t-.001),side),b=this.feederCenter(Math.min(1,t+.001),side),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,offset=(lane-1.5)*15;return at(p.x-dy/len*offset,p.y+dx/len*offset,.04);}
  private addCrowd(color:ColorId,p:Vector3,yaw:number,bob=0,scale=1){const count=this.crowdCounts.get(color)||0;if(count>=650)return;this.scl.set(scale,scale*(1+bob*.06),scale);Quaternion.RotationYawPitchRollToRef(yaw,0,0,this.quat);p.y+=bob*.02;Matrix.ComposeToRef(this.scl,this.quat,p,this.mtx);this.mtx.copyToArray(this.crowdMatrices.get(color)!,count*16);this.crowdCounts.set(color,count+1);}
  update(dt:number){const sim=this.sim;if(!sim)return;for(const color of COLORS)this.crowdCounts.set(color,0);
    for(const visual of this.cars){const car=sim.cars[visual.spec.id],root=visual.root,spec=visual.spec;root.setEnabled(car.status!=='gone');visual.shadow.setEnabled(car.status!=='gone');let p=V(spec.x,.03,spec.z),yaw=spec.yaw,s=spec.scale;
      if(car.status==='travel'){
        const start=V(spec.x,.03,spec.z),target=this.bayPosition(car.bay),t=clamp(car.clock/.95,0,1);
        if(car.vip){p=Vector3.Lerp(start,target,ease(t));p.y+=Math.sin(t*Math.PI)*2;yaw=spec.yaw+Math.sin(t*Math.PI)*.4+(t>.7?(-.32-spec.yaw)*ease((t-.7)/.3):0);}
        else{const points=this.transferPath(spec,car.bay);p=this.along(points,ease(t));const ahead=this.along(points,clamp(ease(t)+.005,0,1)),delta=ahead.subtract(p);yaw=t>.91?-.32:Math.atan2(delta.x,delta.z);}
        s=spec.scale+( .61-spec.scale)*ease(t);
      }else if(car.status==='boarding'){p=this.bayPosition(car.bay);yaw=-.32;s=.61;}
      else if(car.status==='leaving'){const t=clamp((car.clock-CELEBRATION_SECONDS)/DEPART_SECONDS,0,1),start=this.bayPosition(car.bay),end=at(700,542,.03);p=this.curve(start,start.add(V(.8,0,-1.6)),at(570,545,.03),end,t);const q=this.curve(start,start.add(V(.8,0,-1.6)),at(570,545,.03),end,clamp(t+.01,0,1));yaw=Math.atan2(q.x-p.x,q.z-p.z);s=.61;if(car.clock<=CELEBRATION_SECONDS)yaw=-.32;}
      if(car.status==='yard'&&sim.shuffleClock>0){const from=this.shuffleStarts.get(spec.id);if(from){const t=ease(1-sim.shuffleClock/.65);p=Vector3.Lerp(from.position,p,t);p.y+=Math.sin(t*Math.PI)*.45;const delta=Math.atan2(Math.sin(spec.yaw-from.yaw),Math.cos(spec.yaw-from.yaw));yaw=from.yaw+delta*t;}}
      if(visual.nudge>0){visual.nudge=Math.max(0,visual.nudge-dt);const d=direction(yaw),off=Math.sin((.32-visual.nudge)*24)*.09;p.x+=d.x*off;p.z+=d.z*off;}
      root.position.copyFrom(p);root.rotation.y=yaw;root.scaling.setAll(s);visual.shadow.position.set(p.x+.05,.028,p.z-.07);visual.shadow.rotation.y=yaw;visual.shadow.scaling.set(s,s,s);
      if(car.status==='travel'||(car.status==='leaving'&&car.clock>CELEBRATION_SECONDS)){visual.smoke+=Vector3.Distance(p,visual.previous);if(visual.smoke>.16){visual.smoke=0;const d=direction(yaw),tail=MODELS[spec.model].length*s*.5;this.particle(p.add(V(-d.x*tail,0,-d.z*tail)));}}
      visual.previous.copyFrom(p);
    }
    for(const p of sim.people){if(p.state==='boarded')continue;const phase=sim.personPhase(p),lane=p.slot%4;let pos:Vector3,yaw:number;
      if(p.state==='loop'){pos=this.personPoint(phase,lane);yaw=-phase*Math.PI*2;}
      else if(p.state==='entering'){const start=this.feederPoint(p.feedRow||0,lane,p.feedSide??1),target=this.personPoint(phase,lane),t=clamp(p.clock/ENTRY_SECONDS,0,1);pos=Vector3.Lerp(start,target,ease(t));pos.y+=Math.sin(t*Math.PI)*.08;yaw=Math.atan2(target.x-start.x,target.z-start.z);}
      else{const start=this.personPoint(p.startPhase,lane),target=this.bayPosition(sim.cars[p.vehicle].bay);const t=clamp(p.clock/BOARD_SECONDS,0,1);pos=Vector3.Lerp(start,target,ease(t));pos.y+=Math.sin(t*Math.PI)*.15;yaw=Math.atan2(target.x-start.x,target.z-start.z);}
      this.addCrowd(p.color,pos,yaw,Math.sin(sim.time*13+p.id*1.4),.96);
    }
    const queued=Math.min(128,sim.level.passengers.length-sim.feedIndex);
    for(let i=0;i<queued;i++){const absolute=sim.feedIndex+i,side=sim.feedSideAt(absolute),row=sim.feedRowAt(absolute),lane=i%4;if(row>18)continue;
      const pos=this.feederPoint(row,lane,side),ahead=this.feederPoint(row-.1,lane,side);this.addCrowd(sim.level.passengers[absolute],pos,Math.atan2(ahead.x-pos.x,ahead.z-pos.z),Math.sin(sim.time*11+i),.96);
    }
    for(const color of COLORS){const master=this.crowdMasters.get(color)!,count=this.crowdCounts.get(color)!;if(count){master.setEnabled(true);master.thinInstanceCount=count;master.thinInstanceBufferUpdated('matrix');}else master.setEnabled(false);}
    for(let i=this.pools.length-1;i>=0;i--){const p=this.pools[i];p.life-=dt;if(p.life<=0){p.mesh.dispose();this.pools.splice(i,1);continue;}p.mesh.position.addInPlace(p.vel.scale(dt));if(p.confetti){p.vel.y-=dt*1.8;p.mesh.rotation.addInPlace(V(dt*6,dt*4,dt*3));}else p.mesh.scaling.setAll(p.size*(1+(1-p.life/p.max)*2.7));p.mesh.visibility=p.confetti?Math.min(1,p.life/.3):Math.pow(p.life/p.max,1.4);}
  }
  setQuality(){const rect=this.canvas.getBoundingClientRect(),pixels=Math.max(1,rect.width*rect.height),ratio=Math.max(1,Math.min(window.devicePixelRatio||1,3,Math.sqrt(3200000/pixels)));this.engine.setHardwareScalingLevel(1/ratio);}
  resize(layout:GameViewport){
    this.layout=layout;const unit=50*layout.scale,cx=layout.left+296*layout.scale,cy=layout.top+640*layout.scale;
    this.camera.orthoLeft=-cx/unit;this.camera.orthoRight=(layout.width-cx)/unit;
    this.camera.orthoTop=cy/unit;this.camera.orthoBottom=(cy-layout.height)/unit;
    this.setQuality();this.engine.resize();
  }
  render(){this.scene.render();}
  dispose(){this.scene.dispose();this.engine.dispose();}
}
