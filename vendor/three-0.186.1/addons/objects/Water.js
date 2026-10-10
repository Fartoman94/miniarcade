import{Color as h,FrontSide as G,HalfFloatType as X,Matrix4 as C,Mesh as J,PerspectiveCamera as K,Plane as O,ShaderMaterial as Q,UniformsLib as D,UniformsUtils as b,Vector3 as a,Vector4 as P,WebGLRenderTarget as Y}from"three";class Z extends J{constructor(W,e={}){super(W),this.isWater=!0;const s=this,z=e.textureWidth!==void 0?e.textureWidth:512,F=e.textureHeight!==void 0?e.textureHeight:512,N=e.clipBias!==void 0?e.clipBias:0,L=e.alpha!==void 0?e.alpha:1,T=e.time!==void 0?e.time:0,R=e.waterNormals!==void 0?e.waterNormals:null,U=e.sunDirection!==void 0?e.sunDirection:new a(.70707,.70707,0),j=new h(e.sunColor!==void 0?e.sunColor:16777215),k=new h(e.waterColor!==void 0?e.waterColor:8355711),S=e.eye!==void 0?e.eye:new a(0,0,0),V=e.distortionScale!==void 0?e.distortionScale:20,A=e.side!==void 0?e.side:G,B=e.fog!==void 0?e.fog:!1,u=new O,l=new a,c=new a,y=new a,d=new C,x=new a(0,0,-1),n=new P,f=new a,p=new a,v=new P,g=new C,t=new K,M=new Y(z,F,{type:X}),w={name:"MirrorShader",uniforms:b.merge([D.fog,D.lights,{normalSampler:{value:null},mirrorSampler:{value:null},alpha:{value:1},time:{value:0},size:{value:1},distortionScale:{value:20},textureMatrix:{value:new C},sunColor:{value:new h(8355711)},sunDirection:{value:new a(.70707,.70707,0)},eye:{value:new a},waterColor:{value:new h(5592405)}}]),vertexShader:`
				uniform mat4 textureMatrix;
				uniform float time;

				varying vec4 mirrorCoord;
				varying vec4 worldPosition;

				#include <common>
				#include <fog_pars_vertex>
				#include <shadowmap_pars_vertex>
				#include <logdepthbuf_pars_vertex>

				void main() {
					mirrorCoord = modelMatrix * vec4( position, 1.0 );
					worldPosition = mirrorCoord.xyzw;
					mirrorCoord = textureMatrix * mirrorCoord;
					vec4 mvPosition =  modelViewMatrix * vec4( position, 1.0 );
					gl_Position = projectionMatrix * mvPosition;

				#include <beginnormal_vertex>
				#include <defaultnormal_vertex>
				#include <logdepthbuf_vertex>
				#include <fog_vertex>
				#include <shadowmap_vertex>
			}`,fragmentShader:`
				uniform sampler2D mirrorSampler;
				uniform float alpha;
				uniform float time;
				uniform float size;
				uniform float distortionScale;
				uniform sampler2D normalSampler;
				uniform vec3 sunColor;
				uniform vec3 sunDirection;
				uniform vec3 eye;
				uniform vec3 waterColor;

				varying vec4 mirrorCoord;
				varying vec4 worldPosition;

				vec4 getNoise( vec2 uv ) {
					vec2 uv0 = ( uv / 103.0 ) + vec2(time / 17.0, time / 29.0);
					vec2 uv1 = uv / 107.0-vec2( time / -19.0, time / 31.0 );
					vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( time / 101.0, time / 97.0 );
					vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( time / 109.0, time / -113.0 );
					vec4 noise = texture2D( normalSampler, uv0 ) +
						texture2D( normalSampler, uv1 ) +
						texture2D( normalSampler, uv2 ) +
						texture2D( normalSampler, uv3 );
					return noise * 0.5 - 1.0;
				}

				void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor ) {
					vec3 reflection = normalize( reflect( -sunDirection, surfaceNormal ) );
					float direction = max( 0.0, dot( eyeDirection, reflection ) );
					specularColor += pow( direction, shiny ) * sunColor * spec;
					diffuseColor += max( dot( sunDirection, surfaceNormal ), 0.0 ) * sunColor * diffuse;
				}

				#include <common>
				#include <packing>
				#include <bsdfs>
				#include <fog_pars_fragment>
				#include <logdepthbuf_pars_fragment>
				#include <lights_pars_begin>
				#include <shadowmap_pars_fragment>
				#include <shadowmask_pars_fragment>

				void main() {

					#include <logdepthbuf_fragment>
					vec4 noise = getNoise( worldPosition.xz * size );
					vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );

					vec3 diffuseLight = vec3(0.0);
					vec3 specularLight = vec3(0.0);

					vec3 worldToEye = eye-worldPosition.xyz;
					vec3 eyeDirection = normalize( worldToEye );
					sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );

					float distance = length(worldToEye);

					vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / distance ) * distortionScale;
					vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );

					float theta = max( dot( eyeDirection, surfaceNormal ), 0.0 );
					float rf0 = 0.02;
					float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );
					vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;
					vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), reflectionSample + specularLight, reflectance );
					vec3 outgoingLight = albedo;
					gl_FragColor = vec4( outgoingLight, alpha );

					#include <tonemapping_fragment>
					#include <colorspace_fragment>
					#include <fog_fragment>	
				}`},o=new Q({name:w.name,uniforms:b.clone(w.uniforms),vertexShader:w.vertexShader,fragmentShader:w.fragmentShader,lights:!0,side:A,fog:B});o.uniforms.mirrorSampler.value=M.texture,o.uniforms.textureMatrix.value=g,o.uniforms.alpha.value=L,o.uniforms.time.value=T,o.uniforms.normalSampler.value=R,o.uniforms.sunColor.value=j,o.uniforms.waterColor.value=k,o.uniforms.sunDirection.value=U,o.uniforms.distortionScale.value=V,o.uniforms.eye.value=S,s.material=o,s.onBeforeRender=function(r,E,m){if(c.setFromMatrixPosition(s.matrixWorld),y.setFromMatrixPosition(m.matrixWorld),d.extractRotation(s.matrixWorld),l.set(0,0,1),l.applyMatrix4(d),f.subVectors(c,y),f.dot(l)>0)return;f.reflect(l).negate(),f.add(c),d.extractRotation(m.matrixWorld),x.set(0,0,-1),x.applyMatrix4(d),x.add(y),p.subVectors(c,x),p.reflect(l).negate(),p.add(c),t.position.copy(f),t.up.set(0,1,0),t.up.applyMatrix4(d),t.up.reflect(l),t.lookAt(p),t.far=m.far,t.updateMatrixWorld(),t.projectionMatrix.copy(m.projectionMatrix),g.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),g.multiply(t.projectionMatrix),g.multiply(t.matrixWorldInverse),u.setFromNormalAndCoplanarPoint(l,c),u.applyMatrix4(t.matrixWorldInverse),n.set(u.normal.x,u.normal.y,u.normal.z,u.constant);const i=t.projectionMatrix;v.x=(Math.sign(n.x)+i.elements[8])/i.elements[0],v.y=(Math.sign(n.y)+i.elements[9])/i.elements[5],v.z=-1,v.w=(1+i.elements[10])/i.elements[14],n.multiplyScalar(2/n.dot(v)),i.elements[2]=n.x,i.elements[6]=n.y,i.elements[10]=n.z+1-N,i.elements[14]=n.w,S.setFromMatrixPosition(m.matrixWorld);const H=r.getRenderTarget(),I=r.xr.enabled,q=r.shadowMap.autoUpdate;s.visible=!1,r.xr.enabled=!1,r.shadowMap.autoUpdate=!1,r.setRenderTarget(M),r.state.buffers.depth.setMask(!0),r.autoClear===!1&&r.clear(),r.render(E,t),s.visible=!0,r.xr.enabled=I,r.shadowMap.autoUpdate=q,r.setRenderTarget(H);const _=m.viewport;_!==void 0&&r.state.viewport(_)}}}export{Z as Water};
