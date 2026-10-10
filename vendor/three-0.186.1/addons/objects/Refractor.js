import{Color as v,Matrix4 as b,Mesh as F,PerspectiveCamera as j,Plane as h,Quaternion as V,ShaderMaterial as O,UniformsUtils as z,Vector3 as c,Vector4 as w,WebGLRenderTarget as A,HalfFloatType as B}from"three";class p extends F{constructor(g,i={}){super(g),this.isRefractor=!0,this.type="Refractor",this.camera=new j;const l=this,y=i.color!==void 0?new v(i.color):new v(8355711),M=i.textureWidth||512,W=i.textureHeight||512,R=i.clipBias||0,u=i.shader||p.RefractorShader,P=i.multisample!==void 0?i.multisample:4,n=this.camera;n.matrixAutoUpdate=!1,n.userData.refractor=!0;const x=new h,d=new b,m=new A(M,W,{samples:P,type:B});this.material=new O({name:u.name!==void 0?u.name:"unspecified",uniforms:z.clone(u.uniforms),vertexShader:u.vertexShader,fragmentShader:u.fragmentShader,transparent:!0}),this.material.uniforms.color.value=y,this.material.uniforms.tDiffuse.value=m.texture,this.material.uniforms.textureMatrix.value=d;const S=function(){const e=new c,t=new c,r=new b,s=new c,o=new c;return function(f){return e.setFromMatrixPosition(l.matrixWorld),t.setFromMatrixPosition(f.matrixWorld),s.subVectors(e,t),r.extractRotation(l.matrixWorld),o.set(0,0,1),o.applyMatrix4(r),s.dot(o)<0}}(),U=function(){const e=new c,t=new c,r=new V,s=new c;return function(){l.matrixWorld.decompose(t,r,s),e.set(0,0,1).applyQuaternion(r).normalize(),e.negate(),x.setFromNormalAndCoplanarPoint(e,t)}}(),T=function(){const e=new h,t=new w,r=new w;return function(o){n.matrixWorld.copy(o.matrixWorld),n.matrixWorldInverse.copy(n.matrixWorld).invert(),n.projectionMatrix.copy(o.projectionMatrix),n.far=o.far,e.copy(x),e.applyMatrix4(n.matrixWorldInverse),t.set(e.normal.x,e.normal.y,e.normal.z,e.constant);const a=n.projectionMatrix;r.x=(Math.sign(t.x)+a.elements[8])/a.elements[0],r.y=(Math.sign(t.y)+a.elements[9])/a.elements[5],r.z=-1,r.w=(1+a.elements[10])/a.elements[14],t.multiplyScalar(2/t.dot(r)),a.elements[2]=t.x,a.elements[6]=t.y,a.elements[10]=t.z+1-R,a.elements[14]=t.w}}();function C(e){d.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),d.multiply(e.projectionMatrix),d.multiply(e.matrixWorldInverse),d.multiply(l.matrixWorld)}function D(e,t,r){l.visible=!1;const s=e.getRenderTarget(),o=e.xr.enabled,a=e.shadowMap.autoUpdate;e.xr.enabled=!1,e.shadowMap.autoUpdate=!1,e.setRenderTarget(m),e.autoClear===!1&&e.clear(),e.render(t,n),e.xr.enabled=o,e.shadowMap.autoUpdate=a,e.setRenderTarget(s);const f=r.viewport;f!==void 0&&e.state.viewport(f),l.visible=!0}this.onBeforeRender=function(e,t,r){r.userData.refractor!==!0&&S(r)&&(U(),C(r),T(r),D(e,t,r))},this.getRenderTarget=function(){return m},this.dispose=function(){m.dispose(),l.material.dispose()}}}p.RefractorShader={name:"RefractorShader",uniforms:{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null}},vertexShader:`

		uniform mat4 textureMatrix;

		varying vec4 vUv;

		void main() {

			vUv = textureMatrix * vec4( position, 1.0 );
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform vec3 color;
		uniform sampler2D tDiffuse;

		varying vec4 vUv;

		float blendOverlay( float base, float blend ) {

			return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );

		}

		vec3 blendOverlay( vec3 base, vec3 blend ) {

			return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );

		}

		void main() {

			vec4 base = texture2DProj( tDiffuse, vUv );
			gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>

		}`};export{p as Refractor};
