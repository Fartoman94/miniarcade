const u=4,m=1024,c=4;import{DataTexture as y,DataUtils as p,RGBAFormat as T,HalfFloatType as A,RepeatWrapping as x,Mesh as S,InstancedMesh as v,LinearFilter as w,DynamicDrawUsage as F,Matrix4 as L}from"three";function M(n=1){const e=new Uint16Array(m*c*n*u),t=new y(e,m,c*n,T,A);return t.wrapS=x,t.wrapY=x,t.magFilter=w,t.minFilter=w,t.needsUpdate=!0,t}function _(n,e,t=0){const r=Math.floor(m*(c/4));e.arcLengthDivisions=r/2,e.updateArcLengths();const l=e.getSpacedPoints(r),s=e.computeFrenetFrames(r,!0);for(let a=0;a<r;a++){const i=Math.floor(a/m),f=a%m;let o=l[a];h(n,f,o.x,o.y,o.z,0+i+c*t),o=s.tangents[a],h(n,f,o.x,o.y,o.z,1+i+c*t),o=s.normals[a],h(n,f,o.x,o.y,o.z,2+i+c*t),o=s.binormals[a],h(n,f,o.x,o.y,o.z,3+i+c*t)}n.needsUpdate=!0}function h(n,e,t,r,l,s){const a=n.image,{data:i}=a,f=u*m*s;i[e*u+f+0]=p.toHalfFloat(t),i[e*u+f+1]=p.toHalfFloat(r),i[e*u+f+2]=p.toHalfFloat(l),i[e*u+f+3]=p.toHalfFloat(1)}function b(n){return{spineTexture:{value:n},pathOffset:{type:"f",value:0},pathSegment:{type:"f",value:1},spineOffset:{type:"f",value:161},spineLength:{type:"f",value:400},flow:{type:"i",value:1}}}function g(n,e,t=1){n.__ok||(n.__ok=!0,n.onBeforeCompile=r=>{if(r.__modified)return;r.__modified=!0,Object.assign(r.uniforms,e);const l=`
		uniform sampler2D spineTexture;
		uniform float pathOffset;
		uniform float pathSegment;
		uniform float spineOffset;
		uniform float spineLength;
		uniform int flow;

		float textureLayers = ${c*t}.;
		float textureStacks = ${c/4}.;

		${r.vertexShader}
		`.replace("#include <beginnormal_vertex>","").replace("#include <defaultnormal_vertex>","").replace("#include <begin_vertex>","").replace(/void\s*main\s*\(\)\s*\{/,`
void main() {
#include <beginnormal_vertex>

vec4 worldPos = modelMatrix * vec4(position, 1.);

bool bend = flow > 0;
float xWeight = bend ? 0. : 1.;

#ifdef USE_INSTANCING
float pathOffsetFromInstanceMatrix = instanceMatrix[3][2];
float spineLengthFromInstanceMatrix = instanceMatrix[3][0];
float spinePortion = bend ? (worldPos.x + spineOffset) / spineLengthFromInstanceMatrix : 0.;
float mt = (spinePortion * pathSegment + pathOffset + pathOffsetFromInstanceMatrix)*textureStacks;
#else
float spinePortion = bend ? (worldPos.x + spineOffset) / spineLength : 0.;
float mt = (spinePortion * pathSegment + pathOffset)*textureStacks;
#endif

mt = mod(mt, textureStacks);
float rowOffset = floor(mt);

#ifdef USE_INSTANCING
rowOffset += instanceMatrix[3][1] * ${c}.;
#endif

vec3 spinePos = texture2D(spineTexture, vec2(mt, (0. + rowOffset + 0.5) / textureLayers)).xyz;
vec3 a =        texture2D(spineTexture, vec2(mt, (1. + rowOffset + 0.5) / textureLayers)).xyz;
vec3 b =        texture2D(spineTexture, vec2(mt, (2. + rowOffset + 0.5) / textureLayers)).xyz;
vec3 c =        texture2D(spineTexture, vec2(mt, (3. + rowOffset + 0.5) / textureLayers)).xyz;
mat3 basis = mat3(a, b, c);

vec3 transformed = basis
	* vec3(worldPos.x * xWeight, worldPos.y * 1., worldPos.z * 1.)
	+ spinePos;

vec3 transformedNormal = normalMatrix * (basis * objectNormal);
			`).replace("#include <project_vertex>",`vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
				gl_Position = projectionMatrix * mvPosition;`);r.vertexShader=l})}class P{constructor(e,t=1){const r=e.clone(),l=M(t),s=b(l);r.traverse(function(a){if(a instanceof S||a instanceof v)if(Array.isArray(a.material)){const i=[];for(const f of a.material){const o=f.clone();g(o,s,t),i.push(o)}a.material=i}else a.material=a.material.clone(),g(a.material,s,t)}),this.curveArray=new Array(t),this.curveLengthArray=new Array(t),this.object3D=r,this.splineTexture=l,this.uniforms=s}updateCurve(e,t){if(e>=this.curveArray.length)throw Error("Flow: Index out of range.");const r=t.getLength();this.uniforms.spineLength.value=r,this.curveLengthArray[e]=r,this.curveArray[e]=t,_(this.splineTexture,t,e)}moveAlongCurve(e){this.uniforms.pathOffset.value+=e}}const d=new L;class D extends P{constructor(e,t,r,l){const s=new v(r,l,e);s.instanceMatrix.setUsage(F),s.frustumCulled=!1,super(s,t),this.offsets=new Array(e).fill(0),this.whichCurve=new Array(e).fill(0)}writeChanges(e){d.makeTranslation(this.curveLengthArray[this.whichCurve[e]],this.whichCurve[e],this.offsets[e]),this.object3D.setMatrixAt(e,d),this.object3D.instanceMatrix.needsUpdate=!0}moveIndividualAlongCurve(e,t){this.offsets[e]+=t,this.writeChanges(e)}setCurve(e,t){if(isNaN(t))throw Error("InstancedFlow: Curve index being set is Not a Number (NaN).");this.whichCurve[e]=t,this.writeChanges(e)}}export{P as Flow,D as InstancedFlow};
