import{Timer as b,Color as M,Matrix4 as N,Mesh as P,RepeatWrapping as _,ShaderMaterial as z,TextureLoader as B,UniformsLib as L,UniformsUtils as O,Vector2 as H,Vector4 as A}from"three";import{Reflector as W}from"../objects/Reflector.js";import{Refractor as C}from"../objects/Refractor.js";class u extends P{constructor(m,e={}){super(m),this.isWater=!0,this.type="Water";const o=this,R=e.color!==void 0?new M(e.color):new M(16777215),p=e.textureWidth!==void 0?e.textureWidth:512,x=e.textureHeight!==void 0?e.textureHeight:512,h=e.clipBias!==void 0?e.clipBias:0,S=e.flowDirection!==void 0?e.flowDirection:new H(1,0),D=e.flowSpeed!==void 0?e.flowSpeed:.03,F=e.reflectivity!==void 0?e.reflectivity:.02,U=e.scale!==void 0?e.scale:1,l=e.shader!==void 0?e.shader:u.WaterShader,g=new B,w=e.flowMap||void 0,v=e.normalMap0||g.load("textures/water/Water_1_M_Normal.jpg"),d=e.normalMap1||g.load("textures/water/Water_2_M_Normal.jpg"),i=.15,n=i*.5,a=new N,y=new b;if(W===void 0){console.error("THREE.Water: Required component Reflector not found.");return}if(C===void 0){console.error("THREE.Water: Required component Refractor not found.");return}const f=new W(m,{textureWidth:p,textureHeight:x,clipBias:h}),c=new C(m,{textureWidth:p,textureHeight:x,clipBias:h});f.matrixAutoUpdate=!1,c.matrixAutoUpdate=!1,this.material=new z({name:l.name,uniforms:O.merge([L.fog,l.uniforms]),vertexShader:l.vertexShader,fragmentShader:l.fragmentShader,transparent:!0,fog:!0}),w!==void 0?(this.material.defines.USE_FLOWMAP="",this.material.uniforms.tFlowMap={type:"t",value:w}):this.material.uniforms.flowDirection={type:"v2",value:S},v.wrapS=v.wrapT=_,d.wrapS=d.wrapT=_,this.material.uniforms.tReflectionMap.value=f.getRenderTarget().texture,this.material.uniforms.tRefractionMap.value=c.getRenderTarget().texture,this.material.uniforms.tNormalMap0.value=v,this.material.uniforms.tNormalMap1.value=d,this.material.uniforms.color.value=R,this.material.uniforms.reflectivity.value=F,this.material.uniforms.textureMatrix.value=a,this.material.uniforms.config.value.x=0,this.material.uniforms.config.value.y=n,this.material.uniforms.config.value.z=n,this.material.uniforms.config.value.w=U;function E(r){a.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),a.multiply(r.projectionMatrix),a.multiply(r.matrixWorldInverse),a.multiply(o.matrixWorld)}function T(){const r=y.getDelta(),t=o.material.uniforms.config;t.value.x+=D*r,t.value.y=t.value.x+n,t.value.x>=i?(t.value.x=0,t.value.y=n):t.value.y>=i&&(t.value.y=t.value.y-i)}this.onBeforeRender=function(r,t,s){y.update(),E(s),T(),o.visible=!1,f.matrixWorld.copy(o.matrixWorld),c.matrixWorld.copy(o.matrixWorld),f.onBeforeRender(r,t,s),c.onBeforeRender(r,t,s),o.visible=!0}}}u.WaterShader={name:"WaterShader",uniforms:{color:{type:"c",value:null},reflectivity:{type:"f",value:0},tReflectionMap:{type:"t",value:null},tRefractionMap:{type:"t",value:null},tNormalMap0:{type:"t",value:null},tNormalMap1:{type:"t",value:null},textureMatrix:{type:"m4",value:null},config:{type:"v4",value:new A}},vertexShader:`

		#include <common>
		#include <fog_pars_vertex>
		#include <logdepthbuf_pars_vertex>

		uniform mat4 textureMatrix;

		varying vec4 vCoord;
		varying vec2 vUv;
		varying vec3 vToEye;

		void main() {

			vUv = uv;
			vCoord = textureMatrix * vec4( position, 1.0 );

			vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
			vToEye = cameraPosition - worldPosition.xyz;

			vec4 mvPosition =  viewMatrix * worldPosition; // used in fog_vertex
			gl_Position = projectionMatrix * mvPosition;

			#include <logdepthbuf_vertex>
			#include <fog_vertex>

		}`,fragmentShader:`

		#include <common>
		#include <fog_pars_fragment>
		#include <logdepthbuf_pars_fragment>

		uniform sampler2D tReflectionMap;
		uniform sampler2D tRefractionMap;
		uniform sampler2D tNormalMap0;
		uniform sampler2D tNormalMap1;

		#ifdef USE_FLOWMAP
			uniform sampler2D tFlowMap;
		#else
			uniform vec2 flowDirection;
		#endif

		uniform vec3 color;
		uniform float reflectivity;
		uniform vec4 config;

		varying vec4 vCoord;
		varying vec2 vUv;
		varying vec3 vToEye;

		void main() {

			#include <logdepthbuf_fragment>

			float flowMapOffset0 = config.x;
			float flowMapOffset1 = config.y;
			float halfCycle = config.z;
			float scale = config.w;

			vec3 toEye = normalize( vToEye );

			// determine flow direction
			vec2 flow;
			#ifdef USE_FLOWMAP
				flow = texture2D( tFlowMap, vUv ).rg * 2.0 - 1.0;
			#else
				flow = flowDirection;
			#endif
			flow.x *= - 1.0;

			// sample normal maps (distort uvs with flowdata)
			vec4 normalColor0 = texture2D( tNormalMap0, ( vUv * scale ) + flow * flowMapOffset0 );
			vec4 normalColor1 = texture2D( tNormalMap1, ( vUv * scale ) + flow * flowMapOffset1 );

			// linear interpolate to get the final normal color
			float flowLerp = abs( halfCycle - flowMapOffset0 ) / halfCycle;
			vec4 normalColor = mix( normalColor0, normalColor1, flowLerp );

			// calculate normal vector
			vec3 normal = normalize( vec3( normalColor.r * 2.0 - 1.0, normalColor.b,  normalColor.g * 2.0 - 1.0 ) );

			// calculate the fresnel term to blend reflection and refraction maps
			float theta = max( dot( toEye, normal ), 0.0 );
			float reflectance = reflectivity + ( 1.0 - reflectivity ) * pow( ( 1.0 - theta ), 5.0 );

			// calculate final uv coords
			vec3 coord = vCoord.xyz / vCoord.w;
			vec2 uv = coord.xy + coord.z * normal.xz * 0.05;

			vec4 reflectColor = texture2D( tReflectionMap, vec2( 1.0 - uv.x, uv.y ) );
			vec4 refractColor = texture2D( tRefractionMap, uv );

			// multiply water color with the mix of both textures
			gl_FragColor = vec4( color, 1.0 ) * mix( refractColor, reflectColor, reflectance );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>
			#include <fog_fragment>

		}`};export{u as Water};
