import{Color as P,Matrix4 as u,Mesh as L,PerspectiveCamera as Z,ShaderMaterial as k,UniformsUtils as H,Vector2 as T,Vector3 as o,WebGLRenderTarget as z,DepthTexture as B,UnsignedShortType as G,NearestFilter as D,Plane as X,HalfFloatType as q}from"three";class n extends L{constructor(W,l={}){super(W),this.isReflectorForSSRPass=!0,this.type="ReflectorForSSRPass";const e=this,A=l.color!==void 0?new P(l.color):new P(8355711),N=l.textureWidth||512,j=l.textureHeight||512,S=l.clipBias||0,c=l.shader||n.ReflectorShader,f=l.useDepthTexture===!0,U=new o(0,1,0),b=new o,M=new o;e.needsUpdate=!1,e.maxDistance=n.ReflectorShader.uniforms.maxDistance.value,e.opacity=n.ReflectorShader.uniforms.opacity.value,e.color=A,e.resolution=l.resolution||new T(window.innerWidth,window.innerHeight),e._distanceAttenuation=n.ReflectorShader.defines.DISTANCE_ATTENUATION,Object.defineProperty(e,"distanceAttenuation",{get(){return e._distanceAttenuation},set(t){e._distanceAttenuation!==t&&(e._distanceAttenuation=t,e.material.defines.DISTANCE_ATTENUATION=t,e.material.needsUpdate=!0)}}),e._fresnel=n.ReflectorShader.defines.FRESNEL,Object.defineProperty(e,"fresnel",{get(){return e._fresnel},set(t){e._fresnel!==t&&(e._fresnel=t,e.material.defines.FRESNEL=t,e.material.needsUpdate=!0)}});const s=new o,d=new o,y=new o,v=new u,w=new o(0,0,-1),p=new o,g=new o,m=new u,r=new Z;let x;f&&(x=new B,x.type=G,x.minFilter=D,x.magFilter=D);const E={depthTexture:f?x:null,type:q},h=new z(N,j,E),a=new k({name:c.name!==void 0?c.name:"unspecified",transparent:f,defines:Object.assign({},n.ReflectorShader.defines,{useDepthTexture:f}),uniforms:H.clone(c.uniforms),fragmentShader:c.fragmentShader,vertexShader:c.vertexShader});a.uniforms.tDiffuse.value=h.texture,a.uniforms.color.value=e.color,a.uniforms.textureMatrix.value=m,f&&(a.uniforms.tDepth.value=h.depthTexture),this.material=a;const F=[new X(new o(0,1,0),S)];this.doRender=function(t,R,i){if(a.uniforms.maxDistance.value=e.maxDistance,a.uniforms.color.value=e.color,a.uniforms.opacity.value=e.opacity,b.copy(i.position).normalize(),M.copy(b).reflect(U),a.uniforms.fresnelCoe.value=(b.dot(M)+1)/2,d.setFromMatrixPosition(e.matrixWorld),y.setFromMatrixPosition(i.matrixWorld),v.extractRotation(e.matrixWorld),s.set(0,0,1),s.applyMatrix4(v),p.subVectors(d,y),p.dot(s)>0)return;p.reflect(s).negate(),p.add(d),v.extractRotation(i.matrixWorld),w.set(0,0,-1),w.applyMatrix4(v),w.add(y),g.subVectors(d,w),g.reflect(s).negate(),g.add(d),r.position.copy(p),r.up.set(0,1,0),r.up.applyMatrix4(v),r.up.reflect(s),r.lookAt(g),r.far=i.far,r.updateMatrixWorld(),r.projectionMatrix.copy(i.projectionMatrix),a.uniforms.virtualCameraNear.value=i.near,a.uniforms.virtualCameraFar.value=i.far,a.uniforms.virtualCameraMatrixWorld.value=r.matrixWorld,a.uniforms.virtualCameraProjectionMatrix.value=i.projectionMatrix,a.uniforms.virtualCameraProjectionMatrixInverse.value=i.projectionMatrixInverse,a.uniforms.resolution.value=e.resolution,m.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),m.multiply(r.projectionMatrix),m.multiply(r.matrixWorldInverse),m.multiply(e.matrixWorld);const I=t.getRenderTarget(),O=t.xr.enabled,V=t.shadowMap.autoUpdate,_=t.clippingPlanes;t.xr.enabled=!1,t.shadowMap.autoUpdate=!1,t.clippingPlanes=F,t.setRenderTarget(h),t.state.buffers.depth.setMask(!0),t.autoClear===!1&&t.clear(),t.render(R,r),t.xr.enabled=O,t.shadowMap.autoUpdate=V,t.clippingPlanes=_,t.setRenderTarget(I);const C=i.viewport;C!==void 0&&t.state.viewport(C)},this.getRenderTarget=function(){return h},this.dispose=function(){h.dispose(),e.material.dispose()}}}n.ReflectorShader={name:"ReflectorShader",defines:{DISTANCE_ATTENUATION:!0,FRESNEL:!0},uniforms:{color:{value:null},tDiffuse:{value:null},tDepth:{value:null},textureMatrix:{value:new u},maxDistance:{value:180},opacity:{value:.5},fresnelCoe:{value:null},virtualCameraNear:{value:null},virtualCameraFar:{value:null},virtualCameraProjectionMatrix:{value:new u},virtualCameraMatrixWorld:{value:new u},virtualCameraProjectionMatrixInverse:{value:new u},resolution:{value:new T}},vertexShader:`
		uniform mat4 textureMatrix;
		varying vec4 vUv;

		void main() {

			vUv = textureMatrix * vec4( position, 1.0 );

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`
		uniform vec3 color;
		uniform sampler2D tDiffuse;
		uniform sampler2D tDepth;
		uniform float maxDistance;
		uniform float opacity;
		uniform float fresnelCoe;
		uniform float virtualCameraNear;
		uniform float virtualCameraFar;
		uniform mat4 virtualCameraProjectionMatrix;
		uniform mat4 virtualCameraProjectionMatrixInverse;
		uniform mat4 virtualCameraMatrixWorld;
		uniform vec2 resolution;
		varying vec4 vUv;
		#include <packing>
		float blendOverlay( float base, float blend ) {
			return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );
		}
		vec3 blendOverlay( vec3 base, vec3 blend ) {
			return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );
		}
		float getDepth( const in vec2 uv ) {
			return texture2D( tDepth, uv ).x;
		}
		float getViewZ( const in float depth ) {
			return perspectiveDepthToViewZ( depth, virtualCameraNear, virtualCameraFar );
		}
		vec3 getViewPosition( const in vec2 uv, const in float depth/*clip space*/, const in float clipW ) {
			vec4 clipPosition = vec4( ( vec3( uv, depth ) - 0.5 ) * 2.0, 1.0 );//ndc
			clipPosition *= clipW; //clip
			return ( virtualCameraProjectionMatrixInverse * clipPosition ).xyz;//view
		}
		void main() {
			vec4 base = texture2DProj( tDiffuse, vUv );
			#ifdef useDepthTexture
				vec2 uv=(gl_FragCoord.xy-.5)/resolution.xy;
				uv.x=1.-uv.x;
				float depth = texture2DProj( tDepth, vUv ).r;
				float viewZ = getViewZ( depth );
				float clipW = virtualCameraProjectionMatrix[2][3] * viewZ+virtualCameraProjectionMatrix[3][3];
				vec3 viewPosition=getViewPosition( uv, depth, clipW );
				vec3 worldPosition=(virtualCameraMatrixWorld*vec4(viewPosition,1)).xyz;
				if(worldPosition.y>maxDistance) discard;
				float op=opacity;
				#ifdef DISTANCE_ATTENUATION
					float ratio=1.-(worldPosition.y/maxDistance);
					float attenuation=ratio*ratio;
					op=opacity*attenuation;
				#endif
				#ifdef FRESNEL
					op*=fresnelCoe;
				#endif
				gl_FragColor = vec4( blendOverlay( base.rgb, color ), op );
			#else
				gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );
			#endif
		}
	`};export{n as ReflectorForSSRPass};
