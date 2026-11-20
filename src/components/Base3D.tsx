import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Tank } from '../types';

type PlacedBuilding = { id: string; type: string; x: number; z: number; level: number };
const EMPTY_PLACEMENTS: PlacedBuilding[] = [];
type Props = { tank: Tank; levels: Record<string, number>; placements?: PlacedBuilding[]; onSelect: (id: string) => void; onPlace?: (type: string, x: number, z: number) => void };
const defs = [
  { id: 'hq', name: 'Штаб', color: 0x87966c, w: 2.6, h: 1.8, d: 2.4, x: 0, z: 0 },
  { id: 'factory', name: 'Завод', color: 0x687b62, w: 3.2, h: 1.45, d: 2.5, x: -5, z: -2 },
  { id: 'hangar', name: 'Ангар', color: 0x8c8d6a, w: 3.3, h: 1.5, d: 2.7, x: 5, z: -2 },
  { id: 'lab', name: 'Научный центр', color: 0x778b7b, w: 2.5, h: 1.5, d: 2.2, x: -5, z: 3.5 },
  { id: 'arsenal', name: 'Арсенал', color: 0x9a835d, w: 2.5, h: 1.4, d: 2.2, x: 5, z: 3.5 },
];
const mat = (color: number, roughness = .88) => new THREE.MeshStandardMaterial({ color, roughness });
function makeBuilding(id: string, name: string, x: number, z: number, w: number, h: number, d: number, color: number, level: number) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.userData = { id, name, kind: 'building' };
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)); body.position.y = h / 2 + .12; body.castShadow = true; body.receiveShadow = true; body.userData = group.userData; group.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * .72, .72 + level * .06, 4), mat(0x465440)); roof.rotation.y = Math.PI / 4; roof.position.y = h + .5; roof.castShadow = true; roof.userData = group.userData; group.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(.55, .9, .08), mat(0x202a22)); door.position.set(0, .57, d / 2 + .045); door.userData = group.userData; group.add(door);
  for (let i = 0; i < Math.min(4, level); i++) { const strip = new THREE.Mesh(new THREE.BoxGeometry(.12, .22, .12), mat(0xd1d7a0)); strip.position.set(-w * .3 + i * .22, h + .25, 0); strip.userData = group.userData; group.add(strip); }
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + .45, .16, d + .45), mat(0x3d4938)); base.position.y = .08; base.userData = group.userData; group.add(base);
  return group;
}
function makeTank() {
  const g = new THREE.Group();
  const dark = mat(0x202820), green = mat(0x78865a), light = mat(0x9ca77b);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.15, .55, 1.15), green); hull.position.y = .58; hull.castShadow = true; g.add(hull);
  for (const side of [-1, 1]) { const track = new THREE.Mesh(new THREE.BoxGeometry(2.35, .42, .22), dark); track.position.set(0, .38, side * .63); g.add(track); for (let i=0;i<5;i++){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,.12,8),light);wheel.rotation.x=Math.PI/2;wheel.position.set(-.82+i*.41,.38,side*.77);g.add(wheel);} }
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(.43,.55,.35,8), light); turret.position.set(.05,.99,0); turret.castShadow=true;g.add(turret);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.075,.11,1.35,8), dark); barrel.rotation.z=Math.PI/2; barrel.position.set(.86,1.03,0);g.add(barrel);
  g.position.set(1.5,0,5.7); g.rotation.y=-.4; return g;
}
function makeTree(x: number, z: number, scale: number) {
  const g = new THREE.Group(); const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.09,.13,.7,5), mat(0x574a35)); trunk.position.y=.35; g.add(trunk);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(.62*scale,1.65*scale,5),mat(0x526947)); crown.position.y=1.25*scale; crown.castShadow=true;g.add(crown);g.position.set(x,0,z);return g;
}

export function Base3D({ tank, levels, placements = EMPTY_PLACEMENTS, onSelect, onPlace }: Props) {
  const host = useRef<HTMLDivElement>(null); const [placing, setPlacing] = useState(false); const [placeType, setPlaceType] = useState('turret'); const [hint, setHint] = useState('Перетаскивай мышью, чтобы вращать базу · колесо — масштаб');
  const placingRef = useRef(false); const typeRef = useRef(placeType); const callbackRef = useRef(onPlace); const selectRef = useRef(onSelect);
  useEffect(()=>{placingRef.current=placing;},[placing]); useEffect(()=>{typeRef.current=placeType;},[placeType]); useEffect(()=>{callbackRef.current=onPlace;selectRef.current=onSelect;},[onPlace,onSelect]);
  useEffect(() => {
    const el = host.current; if (!el) return;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9aa27a); scene.fog = new THREE.Fog(0x9aa27a, 22, 48);
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / Math.max(1,el.clientHeight), .1, 100); let radius=21, theta=.72, phi=1.02;
    const updateCamera=()=>{camera.position.set(radius*Math.sin(phi)*Math.sin(theta),radius*Math.cos(phi),radius*Math.sin(phi)*Math.cos(theta));camera.lookAt(0,0,0);};updateCamera();
    let renderer: THREE.WebGLRenderer; try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); } catch { el.innerHTML = '<div class="base3d-fallback">3D-графика недоступна в этом браузере. Открой игру в современном браузере с поддержкой WebGL.</div>'; return; } renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7)); renderer.setSize(el.clientWidth, el.clientHeight); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.15; el.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xe8edcf,0x4a563d,2.1)); const sun=new THREE.DirectionalLight(0xfff1cf,2.6);sun.position.set(-8,16,9);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);scene.add(sun);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(34,28),mat(0x65784f));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
    const grid=new THREE.GridHelper(30,30,0xb2bd83,0x89966b);grid.position.y=.018;scene.add(grid);
    const roadMat=mat(0x505847); const roads=[[-0.1,0,1.3,22],[0,0,22,1.25],[-2.5,-2.5,1.0,7],[2.5,2.5,1.0,7]];
    roads.forEach(([x,z,w,d])=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,.035,d),roadMat);m.position.set(x,.035,z);scene.add(m);});
    const clickable:THREE.Object3D[]=[];
    defs.forEach(def=>{const b=makeBuilding(def.id,def.name,def.x,def.z,def.w,def.h,def.d,def.color,levels[def.id]||1);scene.add(b);clickable.push(b,...b.children);});
    const extraDefs:Record<string,{name:string;color:number}>={turret:{name:'Оборонная башня',color:0x77835a},generator:{name:'Генератор',color:0x7d8b82},storage:{name:'Склад ресурсов',color:0x9a865e}};
    placements.forEach(p=>{const d=extraDefs[p.type]||extraDefs.turret;const b=makeBuilding(p.id,d.name,p.x,p.z,1.5,1.25,1.5,d.color,p.level);scene.add(b);clickable.push(b,...b.children);});
    const tank=makeTank();scene.add(tank);
    for(let i=0;i<28;i++){const x=((i*17)%29)-14,z=((i*11)%23)-11;if(Math.abs(x)<7&&Math.abs(z)<6)continue;scene.add(makeTree(x,z,.75+(i%4)*.12));}
    const perimeter=new THREE.Mesh(new THREE.BoxGeometry(30,.25,24),new THREE.MeshStandardMaterial({color:0x3f4c37,wireframe:true}));perimeter.position.y=.12;scene.add(perimeter);
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let downX=0,downY=0,dragging=false,prevX=0,prevY=0;
    const onDown=(e:PointerEvent)=>{downX=prevX=e.clientX;downY=prevY=e.clientY;dragging=true;};
    const onMove=(e:PointerEvent)=>{if(!dragging)return;const dx=e.clientX-prevX,dy=e.clientY-prevY;prevX=e.clientX;prevY=e.clientY;if(Math.abs(e.clientX-downX)+Math.abs(e.clientY-downY)>3){theta-=dx*.008;phi=THREE.MathUtils.clamp(phi+dy*.006,.42,1.42);updateCamera();}};
    const onUp=(e:PointerEvent)=>{if(!dragging)return;dragging=false;if(Math.abs(e.clientX-downX)+Math.abs(e.clientY-downY)>7)return;const rect=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-rect.left)/rect.width)*2-1;pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);
      if(placingRef.current){const groundHits=raycaster.intersectObject(ground);if(groundHits[0]){const p=groundHits[0].point;const x=Math.round(p.x/2)*2,z=Math.round(p.z/2)*2;if(Math.abs(x)<12&&Math.abs(z)<9){callbackRef.current?.(typeRef.current,x,z);setHint('Объект размещён на базе');}else setHint('Нельзя строить за пределами территории');}return;}
      const hit=raycaster.intersectObjects(clickable,true)[0];if(hit){let o:THREE.Object3D|null=hit.object;while(o&&!o.userData.id)o=o.parent;if(o?.userData.id){selectRef.current(String(o.userData.id));setHint(`${o.userData.name||'Объект'} выбран`);}}
    };
    const onWheel=(e:WheelEvent)=>{e.preventDefault();radius=THREE.MathUtils.clamp(radius+e.deltaY*.012,12,32);updateCamera();};
    const canvas=renderer.domElement;canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerup',onUp);canvas.addEventListener('pointerleave',onUp);canvas.addEventListener('wheel',onWheel,{passive:false});
    const resize=()=>{if(!el.isConnected)return;camera.aspect=el.clientWidth/Math.max(1,el.clientHeight);camera.updateProjectionMatrix();renderer.setSize(el.clientWidth,el.clientHeight);};const ro=new ResizeObserver(resize);ro.observe(el);
    let frame=0;const animate=()=>{frame=requestAnimationFrame(animate);tank.rotation.y+=.0007;renderer.render(scene,camera);};animate();
    return()=>{cancelAnimationFrame(frame);ro.disconnect();canvas.removeEventListener('pointerdown',onDown);canvas.removeEventListener('pointermove',onMove);canvas.removeEventListener('pointerup',onUp);canvas.removeEventListener('pointerleave',onUp);canvas.removeEventListener('wheel',onWheel);scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});renderer.dispose();if(el.contains(canvas))el.removeChild(canvas);};
  },[levels,placements]);
  return <section className="base3d-panel"><div className="base3d-top"><div><span className="eyebrow">СЕКТОР 07-B · 3D КОМАНДНЫЙ ЦЕНТР</span><b>Главная база</b></div><span className="base3d-live"><i/> СИСТЕМА АКТИВНА</span></div><div className="base3d-stage"><div className="base3d-canvas" ref={host}/><div className="base3d-compass">N<br/><span>✦</span></div><div className="base3d-controls"><button onClick={()=>{setPlacing(v=>!v);setHint(!placing?'Выбери тип объекта и нажми на свободную клетку':'Режим строительства выключен')}} className={placing?'active':''}>{placing?'Отменить':'＋ Строить'}</button>{placing&&<><select value={placeType} onChange={e=>setPlaceType(e.target.value)}><option value="turret">Оборонная башня · 120 стали</option><option value="generator">Генератор · 100 стали</option><option value="storage">Склад ресурсов · 90 стали</option></select><span>Нажми на свободную клетку</span></>}</div></div><div className="base3d-footer"><span>{hint}</span><span>3D VIEW · {tank.name}</span></div></section>;
}
